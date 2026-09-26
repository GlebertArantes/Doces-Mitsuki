// Edge Function: dm-admin-login
//
// Todo o fluxo de login do painel da Doces Mitsuki acontece aqui, do lado do
// servidor, com a service_role (nunca exposta ao navegador). O navegador só
// envia { tenant_slug, username, password } e recebe de volta os tokens de
// sessão reais (quando o login é aceito) ou um código de erro genérico.
//
// Por que isso é necessário (não apenas uma RPC de banco):
// - Quem valida a senha continua sendo o Supabase Auth (signInWithPassword),
//   chamado aqui dentro, servidor-a-servidor — nunca pelo navegador.
// - O e-mail sintético da conta nunca sai deste servidor: o navegador nunca
//   o recebe, então não há como chamar o Auth diretamente por fora e
//   contornar o bloqueio por tentativas.
// - O resultado do login (sucesso/falha) é o que ESTA função observa
//   diretamente na resposta do Supabase Auth — nunca algo que o navegador
//   possa afirmar. Não há parâmetro "success" vindo do cliente em lugar
//   nenhum deste fluxo.
//
// Revisão de segurança (2ª rodada) corrigiu 4 pontos nesta função:
// 1. As consultas de contagem de tentativas não checavam `error` — uma falha
//    do Postgres/PostgREST fazia `count` vir `undefined`, e `undefined ?? 0`
//    virava zero tentativas, quando na verdade não sabíamos quantas havia.
//    Agora qualquer erro nessas consultas recusa o login (fail-closed).
// 2. `recordAttempt` não conferia se o INSERT/DELETE realmente aconteceu.
//    Um login correto que "tivesse sucesso" sem conseguir gravar o registro
//    de segurança obrigatório passava batido. Agora, se a gravação de um
//    sucesso falhar, o login É RECUSADO mesmo com a senha certa (a sessão do
//    Supabase Auth já emitida é descartada) — sem o registro, não há como
//    garantir a integridade do histórico de bloqueio.
// 3. O IP de origem (`x-forwarded-for`) é informação de rede, não um dado que
//    o servidor validou como verdadeiro — um cliente pode mandar esse
//    cabeçalho com qualquer valor. Trata-se o ÚLTIMO endereço da cadeia como
//    o mais próximo de ser o que a infraestrutura da Supabase observou (é o
//    padrão em cadeias de proxy: cada hop confiável acrescenta ao final o que
//    observou do hop anterior; o primeiro valor é o que o cliente mandou e é
//    livremente falsificável). Mesmo assim, o limite por IP é tratado como
//    uma camada adicional, não como a fronteira de segurança principal — o
//    limite por usuário (que não depende de rede) continua sendo o principal
//    e não pode ser contornado só forjando o cabeçalho.
// 4. Documentado (ver README) que o e-mail sintético não deve seguir um
//    padrão previsível a partir do usuário (ex.: usuario@dominio), já que o
//    padrão em si está documentado neste repositório público.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Opcional: só é usado se alguém configurar o secret no projeto (ver README,
// seção "Cloudflare Turnstile"). Sem ele, a checagem é pulada — nenhuma conta
// de Turnstile foi criada ainda para a Doces Mitsuki.
const TURNSTILE_SECRET_KEY = Deno.env.get("DM_TURNSTILE_SECRET_KEY");

// Origens autorizadas a chamar esta função. Ajuste se o domínio de produção
// ou de preview do Cloudflare Pages mudar.
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (origin === "https://doces-mitsuki.pages.dev") return true;
  if (origin.endsWith(".doces-mitsuki.pages.dev")) return true; // previews
  if (origin === "http://localhost:8080" || origin === "http://127.0.0.1:8080") return true;
  return false;
}

function corsHeaders(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin! : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
    "Content-Type": "application/json",
  };
}

const USERNAME_LOCK_LIMIT = 5;
const IP_LOCK_LIMIT = 20;
const LOCK_WINDOW_MINUTES = 15;
const MAX_USERNAME_LEN = 32;
const MAX_PASSWORD_LEN = 200;

function json(body: unknown, status: number, headers: HeadersInit) {
  return new Response(JSON.stringify(body), { status, headers });
}

// Validação bem simples de formato — o bastante para descartar lixo, não uma
// implementação completa de RFC 5952 (não precisamos disso aqui: o valor só
// é usado como chave de agrupamento para contagem, nunca para roteamento ou
// decisões de confiança fora deste limite de tentativas).
function looksLikeIp(value: string): boolean {
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-f:]+$/i;
  return ipv4.test(value) || (value.includes(":") && ipv6.test(value));
}

// O cabeçalho x-forwarded-for é preenchido pelo cliente OU por proxies
// intermediários — um cliente pode mandar qualquer valor nele. Em uma cadeia
// de proxies bem-comportada, cada hop confiável ACRESCENTA ao final o
// endereço que observou do hop anterior; por isso o último valor tende a ser
// o mais próximo de "o que a infraestrutura da Supabase realmente viu", e o
// primeiro é o mais fácil de falsificar. Não há confirmação oficial de que a
// infraestrutura de Edge Functions da Supabase segue exatamente esse padrão
// em todos os casos — por isso o valor aqui alimenta só uma camada adicional
// (limite por IP), nunca a única linha de defesa (o limite por usuário, que
// não depende de nenhum cabeçalho de rede, continua sendo o principal).
function extractClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return null;
  const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const candidate = parts[parts.length - 1];
  return looksLikeIp(candidate) ? candidate : null;
}

async function verifyTurnstile(token: string | undefined, ip: string | null): Promise<boolean> {
  if (!TURNSTILE_SECRET_KEY) return true; // não configurado ainda: checagem pulada
  if (!token) return false;
  try {
    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: TURNSTILE_SECRET_KEY,
        response: token,
        ...(ip ? { remoteip: ip } : {}),
      }),
    });
    const data = await resp.json();
    return data?.success === true;
  } catch {
    return false; // falha ao verificar conta como reprovado, nunca como aprovado
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, headers);
  if (origin && !isAllowedOrigin(origin)) return json({ error: "origin_not_allowed" }, 403, headers);

  const clientIp = extractClientIp(req); // pode ser null; tratado como sinal best-effort

  let body: { tenant_slug?: unknown; username?: unknown; password?: unknown; turnstileToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_request" }, 400, headers);
  }

  const tenantSlug = String(body.tenant_slug ?? "").trim();
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const turnstileToken = typeof body.turnstileToken === "string" ? body.turnstileToken : undefined;

  if (!tenantSlug || !username || !password) {
    return json({ error: "invalid_credentials" }, 400, headers);
  }
  if (username.length > MAX_USERNAME_LEN || password.length > MAX_PASSWORD_LEN) {
    return json({ error: "invalid_credentials" }, 400, headers);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: tenant, error: tenantErr } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", tenantSlug)
    .maybeSingle();
  if (tenantErr) {
    console.error("dm-admin-login: tenant lookup failed", tenantErr);
    return json({ error: "service_unavailable" }, 503, headers);
  }
  if (!tenant) return json({ error: "invalid_credentials" }, 401, headers);

  const windowStart = new Date(Date.now() - LOCK_WINDOW_MINUTES * 60_000).toISOString();

  // Falha em QUALQUER uma dessas contagens é tratada como "não sabemos
  // quantas tentativas houve" — nunca como "zero tentativas". Um erro aqui
  // recusa o login de forma controlada (503), em vez de deixar passar.
  const [userAttemptsRes, ipAttemptsRes] = await Promise.all([
    admin
      .from("dm_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .eq("username", username)
      .eq("success", false)
      .gte("attempted_at", windowStart),
    clientIp
      ? admin
          .from("dm_login_attempts")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant.id)
          .eq("source_ip", clientIp)
          .eq("success", false)
          .gte("attempted_at", windowStart)
      : Promise.resolve({ count: 0, error: null } as const),
  ]);

  if (userAttemptsRes.error) {
    console.error("dm-admin-login: username lockout check failed", userAttemptsRes.error);
    return json({ error: "service_unavailable" }, 503, headers);
  }
  if (ipAttemptsRes.error) {
    console.error("dm-admin-login: ip lockout check failed", ipAttemptsRes.error);
    return json({ error: "service_unavailable" }, 503, headers);
  }

  const userFailures = userAttemptsRes.count ?? 0;
  const ipFailures = ipAttemptsRes.count ?? 0;

  if (userFailures >= USERNAME_LOCK_LIMIT || ipFailures >= IP_LOCK_LIMIT) {
    return json({ error: "too_many_attempts" }, 429, headers);
  }

  if (!(await verifyTurnstile(turnstileToken, clientIp))) {
    return json({ error: "captcha_failed" }, 400, headers);
  }

  // Grava a tentativa e devolve se a gravação realmente aconteceu. Isso é o
  // registro de segurança obrigatório: sem ele, o histórico de bloqueio fica
  // com um buraco, e (no caso de sucesso) não há como honrar esse login.
  async function recordAttempt(success: boolean): Promise<{ ok: boolean }> {
    const { error: insertErr } = await admin.from("dm_login_attempts").insert({
      tenant_id: tenant!.id,
      username,
      source_ip: clientIp,
      success,
    });
    if (insertErr) {
      console.error("dm-admin-login: failed to record login attempt", insertErr);
      return { ok: false };
    }
    if (success) {
      const { error: deleteErr } = await admin
        .from("dm_login_attempts")
        .delete()
        .eq("tenant_id", tenant!.id)
        .eq("username", username)
        .eq("success", false);
      if (deleteErr) {
        // Não invalida o sucesso por si só (o registro do sucesso já foi
        // gravado acima), mas fica registrado para investigação.
        console.error("dm-admin-login: failed to clear failed attempts after success", deleteErr);
      }
    }
    return { ok: true };
  }

  const { data: mapping, error: mappingErr } = await admin
    .from("dm_admin_usernames")
    .select("user_id")
    .eq("tenant_id", tenant.id)
    .eq("username", username)
    .maybeSingle();
  if (mappingErr) {
    console.error("dm-admin-login: username mapping lookup failed", mappingErr);
    return json({ error: "service_unavailable" }, 503, headers);
  }
  if (!mapping) {
    await recordAttempt(false);
    return json({ error: "invalid_credentials" }, 401, headers);
  }

  const { data: membership, error: membershipErr } = await admin
    .from("tenant_memberships")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", mapping.user_id)
    .maybeSingle();
  if (membershipErr) {
    console.error("dm-admin-login: membership lookup failed", membershipErr);
    return json({ error: "service_unavailable" }, 503, headers);
  }
  if (!membership) {
    await recordAttempt(false);
    return json({ error: "invalid_credentials" }, 401, headers);
  }

  const { data: userRec, error: userErr } = await admin.auth.admin.getUserById(mapping.user_id);
  if (userErr || !userRec?.user?.email) {
    await recordAttempt(false);
    return json({ error: "invalid_credentials" }, 401, headers);
  }

  // A senha é validada aqui, servidor-a-servidor, pelo Supabase Auth de
  // verdade. O e-mail nunca é devolvido ao navegador.
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
    email: userRec.user.email,
    password,
  });

  const loginSucceeded = !signInError && !!signInData?.session;
  const attemptRecorded = await recordAttempt(loginSucceeded);

  if (!loginSucceeded) {
    return json({ error: "invalid_credentials" }, 401, headers);
  }

  if (!attemptRecorded.ok) {
    // A senha estava certa, mas não conseguimos gravar o registro de
    // segurança obrigatório. Não honramos este login: descarta a sessão que
    // o Supabase Auth já havia emitido e devolve um erro controlado, em vez
    // de deixar passar um sucesso sem auditoria/controle de tentativas.
    await anonClient.auth.signOut().catch(() => {});
    return json({ error: "service_unavailable" }, 503, headers);
  }

  return json(
    {
      access_token: signInData!.session!.access_token,
      refresh_token: signInData!.session!.refresh_token,
    },
    200,
    headers,
  );
});
