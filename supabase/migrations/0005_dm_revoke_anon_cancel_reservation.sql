-- dm_cancel_reservation already checks is_tenant_admin/is_tenant_owner internally and
-- was never actually usable by anon (no session -> auth.uid() is null -> not_authorized),
-- but the security advisor still flags it as callable by anon/public at the grant level
-- (defense-in-depth: don't expose a staff-only RPC to unauthenticated callers at all,
-- even if the internal check already blocks them). dm_create_reservation is untouched:
-- it must stay callable by anon, since customers reserve without logging in.
revoke execute on function public.dm_cancel_reservation(uuid, text) from public;
revoke execute on function public.dm_cancel_reservation(uuid, text) from anon;
grant execute on function public.dm_cancel_reservation(uuid, text) to authenticated;
