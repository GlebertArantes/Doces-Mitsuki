-- Corrige um problema de desenho encontrado em revisão na migração 0006:
--
-- 1) dm_report_login_result aceitava um p_success informado pelo próprio
--    navegador. Um cliente não autenticado podia reportar um sucesso falso
--    (limpando o histórico de falhas de qualquer usuário) ou reportar falsas
--    falhas (bloqueando um usuário legítimo por força bruta reversa).
-- 2) dm_resolve_admin_login devolvia o e-mail sintético para o navegador.
--    Com esse e-mail em mãos, um cliente podia chamar
--    supabase.auth.signInWithPassword diretamente, contornando por completo
--    o bloqueio por tentativas que a RPC impunha (a RPC nunca era chamada).
--
-- As duas funções são removidas. O login passa a acontecer inteiramente
-- dentro da Edge Function `dm-admin-login` (supabase/functions/dm-admin-login),
-- que roda com a service_role (nunca exposta ao navegador): ela resolve o
-- usuário, aplica o bloqueio por tentativas, chama o Supabase Auth ela mesma
-- (o e-mail nunca sai do servidor) e só então devolve os tokens de sessão
-- reais ao navegador. Como o navegador nunca recebe o e-mail nem fala
-- diretamente com o GoTrue, não há como contornar o bloqueio chamando a
-- API de autenticação por fora.
revoke execute on function public.dm_resolve_admin_login(text, text) from anon, authenticated, public;
revoke execute on function public.dm_report_login_result(text, text, boolean) from anon, authenticated, public;
drop function if exists public.dm_resolve_admin_login(text, text);
drop function if exists public.dm_report_login_result(text, text, boolean);

-- dm_login_attempts passa a ser escrita só pela Edge Function (service_role,
-- que ignora RLS por natureza — nenhuma policy de INSERT é necessária ou
-- desejável aqui para anon/authenticated). Adiciona o IP de origem para
-- permitir um segundo limite, mais amplo, por IP (além do limite por
-- usuário), útil contra tentativas distribuídas entre vários usuários.
alter table public.dm_login_attempts add column if not exists source_ip text;
create index if not exists dm_login_attempts_ip_idx
  on public.dm_login_attempts(tenant_id, source_ip, attempted_at desc);
