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

async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  if (!TURNSTILE_SECRET_KEY) return true; // não configurado ainda: checagem pulada
  if (!token) return false;
  try {
    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
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

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

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

  const { data: tenant } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", tenantSlug)
    .maybeSingle();
  if (!tenant) return json({ error: "invalid_credentials" }, 401, headers);

  const windowStart = new Date(Date.now() - LOCK_WINDOW_MINUTES * 60_000).toISOString();

  const [{ count: userFailures }, { count: ipFailures }] = await Promise.all([
    admin
      .from("dm_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .eq("username", username)
      .eq("success", false)
      .gte("attempted_at", windowStart),
    admin
      .from("dm_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .eq("source_ip", ip)
      .eq("success", false)
      .gte("attempted_at", windowStart),
  ]);

  if ((userFailures ?? 0) >= USERNAME_LOCK_LIMIT || (ipFailures ?? 0) >= IP_LOCK_LIMIT) {
    return json({ error: "too_many_attempts" }, 429, headers);
  }

  if (!(await verifyTurnstile(turnstileToken, ip))) {
    return json({ error: "captcha_failed" }, 400, headers);
  }

  async function recordAttempt(success: boolean) {
    await admin.from("dm_login_attempts").insert({
      tenant_id: tenant!.id,
      username,
      source_ip: ip,
      success,
    });
    if (success) {
      await admin
        .from("dm_login_attempts")
        .delete()
        .eq("tenant_id", tenant!.id)
        .eq("username", username)
        .eq("success", false);
    }
  }

  const { data: mapping } = await admin
    .from("dm_admin_usernames")
    .select("user_id")
    .eq("tenant_id", tenant.id)
    .eq("username", username)
    .maybeSingle();
  if (!mapping) {
    await recordAttempt(false);
    return json({ error: "invalid_credentials" }, 401, headers);
  }

  const { data: membership } = await admin
    .from("tenant_memberships")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", mapping.user_id)
    .maybeSingle();
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

  await recordAttempt(!signInError && !!signInData?.session);

  if (signInError || !signInData?.session) {
    return json({ error: "invalid_credentials" }, 401, headers);
  }

  return json(
    {
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
    },
    200,
    headers,
  );
});
