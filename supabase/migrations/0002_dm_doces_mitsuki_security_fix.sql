-- Fix advisor findings from 0001_dm_doces_mitsuki_schema:
-- 1) dm_sales_report must run as invoker so dm_reservations RLS (staff-only) applies,
--    and must not be publicly selectable.
drop view if exists public.dm_sales_report;
create view public.dm_sales_report
with (security_invoker = true) as
select r.tenant_id,
  count(*) filter (where r.status <> 'cancelado') as total_reservas,
  count(*) filter (where r.status = 'cancelado') as total_canceladas,
  count(*) filter (where r.status <> 'cancelado' and r.status <> 'retirado') as total_pendentes,
  coalesce(sum(r.total_cents) filter (where r.payment_status = 'pago' and r.status <> 'cancelado'), 0) as total_recebido_cents
from public.dm_reservations r
group by r.tenant_id;

revoke all on public.dm_sales_report from anon, public;
grant select on public.dm_sales_report to authenticated;

-- 2) dm_sync_availability is a trigger-only helper, not an RPC.
revoke all on function public.dm_sync_availability() from anon, authenticated, public;
