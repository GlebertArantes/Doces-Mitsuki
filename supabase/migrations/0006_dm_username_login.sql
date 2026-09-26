-- Login do painel por "usuário" em vez de e-mail, mantendo o Supabase Auth de
-- verdade (signInWithPassword continua sendo quem valida a senha; nada de
-- checagem de senha em JavaScript ou em SQL).
--
-- Como funciona: cada administrador tem, além da conta Supabase Auth (cujo
-- e-mail é um endereço interno/sintético, nunca o e-mail pessoal da pessoa),
-- uma linha em dm_admin_usernames com o "usuário" que ela digita para entrar
-- (ex.: "mitsuki"). O painel chama dm_resolve_admin_login(tenant, usuario)
-- para descobrir qual e-mail interno corresponde àquele usuário, e só então
-- chama supabase.auth.signInWithPassword com esse e-mail + a senha digitada.
-- O e-mail nunca é mostrado na tela nem digitado por ninguém.
--
-- Proteção contra força bruta: como o backend nunca vê a senha (quem valida é
-- o GoTrue/Supabase Auth), o controle possível aqui é por tentativas malsucedidas
-- reportadas pelo próprio cliente após a resposta do signInWithPassword. Isso é
-- reforçado (não substituído) pelas proteções nativas do Supabase Auth.

create table if not exists public.dm_admin_usernames (
  tenant_id uuid not null references public.tenants(id),
  username text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (tenant_id, username),
  unique (user_id),
  constraint dm_admin_usernames_format check (username = lower(username) and username ~ '^[a-z0-9._-]{3,32}$')
);
create index if not exists dm_admin_usernames_user_idx on public.dm_admin_usernames(user_id);
alter table public.dm_admin_usernames enable row level security;

drop policy if exists "dm_admin_usernames: admin gerencia" on public.dm_admin_usernames;
create policy "dm_admin_usernames: admin gerencia" on public.dm_admin_usernames
  for all using (public.is_tenant_admin(tenant_id) or public.is_tenant_owner(tenant_id))
  with check (public.is_tenant_admin(tenant_id) or public.is_tenant_owner(tenant_id));
-- Nenhuma policy pública de SELECT: a única forma de "ler" isto de fora é
-- através da função abaixo, que devolve só o e-mail interno, nunca a linha.

create table if not exists public.dm_login_attempts (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id),
  username text not null,
  success boolean not null,
  attempted_at timestamptz not null default now()
);
create index if not exists dm_login_attempts_lookup_idx on public.dm_login_attempts(tenant_id, username, attempted_at desc);
alter table public.dm_login_attempts enable row level security;

drop policy if exists "dm_login_attempts: admin audita" on public.dm_login_attempts;
create policy "dm_login_attempts: admin audita" on public.dm_login_attempts
  for select using (public.is_tenant_admin(tenant_id) or public.is_tenant_owner(tenant_id));
-- Sem policy de INSERT: só é gravado pelas funções SECURITY DEFINER abaixo.

create or replace function public.dm_resolve_admin_login(p_tenant_slug text, p_username text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_tenant public.tenants%rowtype;
  v_username text := lower(trim(coalesce(p_username, '')));
  v_recent_failures int;
  v_row public.dm_admin_usernames%rowtype;
  v_email text;
begin
  select * into v_tenant from public.tenants where slug = p_tenant_slug;
  if not found then raise exception 'invalid_credentials'; end if;

  if v_username = '' then raise exception 'invalid_credentials'; end if;

  select count(*) into v_recent_failures
    from public.dm_login_attempts
    where tenant_id = v_tenant.id and username = v_username
      and success = false and attempted_at > now() - interval '15 minutes';
  if v_recent_failures >= 5 then
    raise exception 'too_many_attempts';
  end if;

  select * into v_row from public.dm_admin_usernames
    where tenant_id = v_tenant.id and username = v_username;
  if not found then raise exception 'invalid_credentials'; end if;

  if not exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = v_tenant.id and m.user_id = v_row.user_id
  ) then
    raise exception 'invalid_credentials';
  end if;

  select u.email into v_email from auth.users u where u.id = v_row.user_id;
  if v_email is null then raise exception 'invalid_credentials'; end if;

  return v_email;
end;
$$;

revoke all on function public.dm_resolve_admin_login(text, text) from public;
grant execute on function public.dm_resolve_admin_login(text, text) to anon, authenticated;

create or replace function public.dm_report_login_result(p_tenant_slug text, p_username text, p_success boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tenant public.tenants%rowtype;
  v_username text := lower(trim(coalesce(p_username, '')));
begin
  select * into v_tenant from public.tenants where slug = p_tenant_slug;
  if not found or v_username = '' then return; end if;

  insert into public.dm_login_attempts (tenant_id, username, success)
    values (v_tenant.id, v_username, coalesce(p_success, false));

  if p_success then
    delete from public.dm_login_attempts
      where tenant_id = v_tenant.id and username = v_username and success = false;
  end if;
end;
$$;

revoke all on function public.dm_report_login_result(text, text, boolean) from public;
grant execute on function public.dm_report_login_result(text, text, boolean) to anon, authenticated;
