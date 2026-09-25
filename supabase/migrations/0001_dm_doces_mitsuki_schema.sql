-- Doces Mitsuki (tenant fcd11091-0ebc-45a7-9f0b-cf67907ace96) additive schema.
-- Reuses shared public.products/categories/product_media/tenants/tenant_memberships/
-- order_code_counters. Adds isolated dm_* tables only. No existing table is
-- altered, dropped, or has its policies changed.

-- 1) product extension: kind + box slot count, without touching public.products
create table if not exists public.dm_product_ext (
  product_id uuid primary key references public.products(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id),
  kind text not null check (kind in ('ready_box','buildable_box','flavor')),
  box_slot_count int check (box_slot_count is null or box_slot_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dm_product_ext_tenant_idx on public.dm_product_ext(tenant_id);
alter table public.dm_product_ext enable row level security;

drop policy if exists "dm_product_ext: catálogo gerencia" on public.dm_product_ext;
create policy "dm_product_ext: catálogo gerencia" on public.dm_product_ext
  for all using (public.can_manage_catalog(tenant_id)) with check (public.can_manage_catalog(tenant_id));

drop policy if exists "dm_product_ext: leitura pública de tenants ativos" on public.dm_product_ext;
create policy "dm_product_ext: leitura pública de tenants ativos" on public.dm_product_ext
  for select using (
    exists (select 1 from public.tenants t where t.id = dm_product_ext.tenant_id and t.is_active)
    or public.can_manage_catalog(tenant_id)
  );

-- 2) stock (current available quantity per product), staff-only visibility
create table if not exists public.dm_stock (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id),
  product_id uuid not null references public.products(id) on delete cascade,
  quantity_available int not null default 0 check (quantity_available >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (tenant_id, product_id)
);
create index if not exists dm_stock_tenant_idx on public.dm_stock(tenant_id);
alter table public.dm_stock enable row level security;

drop policy if exists "dm_stock: catálogo gerencia" on public.dm_stock;
create policy "dm_stock: catálogo gerencia" on public.dm_stock
  for all using (public.can_manage_catalog(tenant_id)) with check (public.can_manage_catalog(tenant_id));

-- 3) public availability projection (no numbers exposed), kept in sync by trigger
create table if not exists public.dm_availability_public (
  tenant_id uuid not null references public.tenants(id),
  product_id uuid primary key references public.products(id) on delete cascade,
  is_available boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists dm_availability_public_tenant_idx on public.dm_availability_public(tenant_id);
alter table public.dm_availability_public enable row level security;

drop policy if exists "dm_availability_public: leitura pública de tenants ativos" on public.dm_availability_public;
create policy "dm_availability_public: leitura pública de tenants ativos" on public.dm_availability_public
  for select using (
    exists (select 1 from public.tenants t where t.id = dm_availability_public.tenant_id and t.is_active)
    or public.can_manage_catalog(tenant_id)
  );

drop policy if exists "dm_availability_public: sistema gerencia" on public.dm_availability_public;
create policy "dm_availability_public: sistema gerencia" on public.dm_availability_public
  for all using (public.can_manage_catalog(tenant_id)) with check (public.can_manage_catalog(tenant_id));

create or replace function public.dm_sync_availability() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.dm_availability_public (tenant_id, product_id, is_available, updated_at)
  values (new.tenant_id, new.product_id, new.quantity_available > 0, now())
  on conflict (product_id) do update
    set is_available = excluded.is_available, updated_at = now(), tenant_id = excluded.tenant_id;
  return new;
end;
$$;

drop trigger if exists dm_stock_sync_availability on public.dm_stock;
create trigger dm_stock_sync_availability
  after insert or update of quantity_available on public.dm_stock
  for each row execute function public.dm_sync_availability();

-- 4) store status (open/closed for new reservations), independent from tenants.is_active
create table if not exists public.dm_store_status (
  tenant_id uuid primary key references public.tenants(id),
  is_open boolean not null default false,
  pickup_instructions text not null default 'Retirada diretamente com a Mitsuki, na Brago.',
  pix_key text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.dm_store_status enable row level security;

drop policy if exists "dm_store_status: leitura pública de tenants ativos" on public.dm_store_status;
create policy "dm_store_status: leitura pública de tenants ativos" on public.dm_store_status
  for select using (
    exists (select 1 from public.tenants t where t.id = dm_store_status.tenant_id and t.is_active)
    or public.is_tenant_admin(tenant_id) or public.is_tenant_owner(tenant_id)
  );

drop policy if exists "dm_store_status: admin gerencia" on public.dm_store_status;
create policy "dm_store_status: admin gerencia" on public.dm_store_status
  for all using (public.is_tenant_admin(tenant_id) or public.is_tenant_owner(tenant_id))
  with check (public.is_tenant_admin(tenant_id) or public.is_tenant_owner(tenant_id));

-- 5) reservations (staff-only reads; writes only via SECURITY DEFINER RPCs below,
--    except status/payment fields which trusted staff may update directly)
create table if not exists public.dm_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  order_code text not null,
  customer_name text not null,
  customer_sector text,
  note text,
  status text not null default 'recebido' check (status in ('recebido','separado','retirado','cancelado')),
  payment_status text not null default 'pendente' check (payment_status in ('pendente','pago')),
  payment_confirmed_at timestamptz,
  payment_confirmed_by uuid references auth.users(id),
  total_cents bigint not null check (total_cents > 0),
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  picked_up_at timestamptz,
  cancelled_at timestamptz,
  cancelled_reason text,
  unique (tenant_id, order_code),
  unique (tenant_id, idempotency_key)
);
create index if not exists dm_reservations_tenant_idx on public.dm_reservations(tenant_id, created_at desc);
alter table public.dm_reservations enable row level security;

drop policy if exists "dm_reservations: staff lê e gerencia" on public.dm_reservations;
create policy "dm_reservations: staff lê e gerencia" on public.dm_reservations
  for all using (public.is_tenant_admin(tenant_id) or public.is_tenant_owner(tenant_id))
  with check (public.is_tenant_admin(tenant_id) or public.is_tenant_owner(tenant_id));

create table if not exists public.dm_reservation_items (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.dm_reservations(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id),
  product_id uuid not null references public.products(id),
  product_kind text not null check (product_kind in ('ready_box','buildable_box','flavor')),
  product_name_snapshot text not null,
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  quantity int not null check (quantity > 0),
  flavor_selection jsonb,
  created_at timestamptz not null default now()
);
create index if not exists dm_reservation_items_res_idx on public.dm_reservation_items(reservation_id);
alter table public.dm_reservation_items enable row level security;

drop policy if exists "dm_reservation_items: staff lê" on public.dm_reservation_items;
create policy "dm_reservation_items: staff lê" on public.dm_reservation_items
  for select using (public.is_tenant_admin(tenant_id) or public.is_tenant_owner(tenant_id));

-- 6) manual sale reporting helper view (staff-only via base table RLS)
create or replace view public.dm_sales_report as
select r.tenant_id,
  count(*) filter (where r.status <> 'cancelado') as total_reservas,
  count(*) filter (where r.status = 'cancelado') as total_canceladas,
  count(*) filter (where r.status <> 'cancelado' and r.status <> 'retirado') as total_pendentes,
  coalesce(sum(r.total_cents) filter (where r.payment_status = 'pago' and r.status <> 'cancelado'), 0) as total_recebido_cents
from public.dm_reservations r
group by r.tenant_id;

-- 7) atomic reservation creation (validates store open + tenant published + stock,
--    decrements stock and issues DM-AAMMDD-NNN code, all in one transaction)
create or replace function public.dm_create_reservation(
  p_tenant_slug text,
  p_customer_name text,
  p_customer_sector text,
  p_note text,
  p_items jsonb,
  p_idempotency_key text
) returns table(order_code text, reservation_id uuid, total_cents bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_tenant public.tenants%rowtype;
  v_status public.dm_store_status%rowtype;
  v_reservation_id uuid := gen_random_uuid();
  v_item jsonb;
  v_product public.products%rowtype;
  v_ext public.dm_product_ext%rowtype;
  v_unit_cents bigint;
  v_total_cents bigint := 0;
  v_qty int;
  v_flavor_ids uuid[];
  v_flavor_id uuid;
  v_needed int;
  v_seq int;
  v_order_code text;
  v_existing public.dm_reservations%rowtype;
begin
  select * into v_tenant from public.tenants where slug = p_tenant_slug for update;
  if not found then raise exception 'tenant_not_found'; end if;
  if not v_tenant.is_active then raise exception 'store_not_published'; end if;

  select * into v_status from public.dm_store_status where tenant_id = v_tenant.id;
  if not found or not v_status.is_open then raise exception 'store_closed'; end if;

  if p_customer_name is null or length(trim(p_customer_name)) = 0 then
    raise exception 'customer_name_required';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.dm_reservations
      where tenant_id = v_tenant.id and idempotency_key = p_idempotency_key;
    if found then
      return query select v_existing.order_code, v_existing.id, v_existing.total_cents;
      return;
    end if;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products
      where id = (v_item->>'product_id')::uuid and tenant_id = v_tenant.id and status = 'published';
    if not found then raise exception 'product_not_available'; end if;

    select * into v_ext from public.dm_product_ext
      where product_id = v_product.id and tenant_id = v_tenant.id;
    if not found then raise exception 'product_not_configured'; end if;

    v_qty := (v_item->>'quantity')::int;
    if v_qty is null or v_qty <= 0 then raise exception 'invalid_quantity'; end if;

    v_unit_cents := round(v_product.price * 100)::bigint;
    v_total_cents := v_total_cents + v_unit_cents * v_qty;

    if v_ext.kind in ('ready_box','flavor') then
      update public.dm_stock
        set quantity_available = quantity_available - v_qty, updated_at = now()
        where tenant_id = v_tenant.id and product_id = v_product.id
          and quantity_available >= v_qty;
      if not found then raise exception 'insufficient_stock'; end if;

      insert into public.dm_reservation_items
        (reservation_id, tenant_id, product_id, product_kind, product_name_snapshot, unit_price_cents, quantity, flavor_selection)
        values (v_reservation_id, v_tenant.id, v_product.id, v_ext.kind, v_product.name, v_unit_cents, v_qty, null);

    elsif v_ext.kind = 'buildable_box' then
      select array(select (jsonb_array_elements_text(v_item->'flavor_selection'))::uuid) into v_flavor_ids;
      if v_flavor_ids is null or array_length(v_flavor_ids, 1) is distinct from v_ext.box_slot_count then
        raise exception 'invalid_box_composition';
      end if;

      for v_flavor_id in select distinct f from unnest(v_flavor_ids) as f loop
        select count(*) into v_needed from unnest(v_flavor_ids) as f2 where f2 = v_flavor_id;
        v_needed := v_needed * v_qty;
        update public.dm_stock
          set quantity_available = quantity_available - v_needed, updated_at = now()
          where tenant_id = v_tenant.id and product_id = v_flavor_id
            and quantity_available >= v_needed;
        if not found then raise exception 'insufficient_stock'; end if;
      end loop;

      insert into public.dm_reservation_items
        (reservation_id, tenant_id, product_id, product_kind, product_name_snapshot, unit_price_cents, quantity, flavor_selection)
        values (v_reservation_id, v_tenant.id, v_product.id, v_ext.kind, v_product.name, v_unit_cents, v_qty, to_jsonb(v_flavor_ids));
    else
      raise exception 'unknown_product_kind';
    end if;
  end loop;

  insert into public.order_code_counters (tenant_id, order_date, last_seq)
    values (v_tenant.id, current_date, 1)
    on conflict (tenant_id, order_date) do update
      set last_seq = public.order_code_counters.last_seq + 1, updated_at = now()
    returning last_seq into v_seq;

  v_order_code := coalesce(v_tenant.order_code_prefix, 'DM') || '-' || to_char(current_date, 'YYMMDD') || '-' || lpad(v_seq::text, 3, '0');

  insert into public.dm_reservations
    (id, tenant_id, order_code, customer_name, customer_sector, note, status, payment_status, total_cents, idempotency_key)
    values (v_reservation_id, v_tenant.id, v_order_code, trim(p_customer_name), nullif(trim(coalesce(p_customer_sector, '')), ''),
            nullif(trim(coalesce(p_note, '')), ''), 'recebido', 'pendente', v_total_cents, p_idempotency_key);

  return query select v_order_code, v_reservation_id, v_total_cents;
end;
$$;

revoke all on function public.dm_create_reservation(text, text, text, text, jsonb, text) from public;
grant execute on function public.dm_create_reservation(text, text, text, text, jsonb, text) to anon, authenticated;

-- 8) atomic cancellation with stock restore, guarded against double refund
create or replace function public.dm_cancel_reservation(p_reservation_id uuid, p_reason text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_res public.dm_reservations%rowtype;
  v_item record;
  v_flavor jsonb;
begin
  select * into v_res from public.dm_reservations where id = p_reservation_id for update;
  if not found then raise exception 'reservation_not_found'; end if;

  if not (public.is_tenant_admin(v_res.tenant_id) or public.is_tenant_owner(v_res.tenant_id)) then
    raise exception 'not_authorized';
  end if;

  if v_res.status = 'cancelado' then return true; end if;
  if v_res.status = 'retirado' then raise exception 'cannot_cancel_picked_up'; end if;

  for v_item in select * from public.dm_reservation_items where reservation_id = p_reservation_id loop
    if v_item.product_kind in ('ready_box','flavor') then
      update public.dm_stock set quantity_available = quantity_available + v_item.quantity, updated_at = now()
        where tenant_id = v_res.tenant_id and product_id = v_item.product_id;
    elsif v_item.product_kind = 'buildable_box' then
      for v_flavor in select jsonb_array_elements(v_item.flavor_selection) loop
        update public.dm_stock set quantity_available = quantity_available + v_item.quantity, updated_at = now()
          where tenant_id = v_res.tenant_id and product_id = (v_flavor#>>'{}')::uuid;
      end loop;
    end if;
  end loop;

  update public.dm_reservations
    set status = 'cancelado', cancelled_at = now(), cancelled_reason = p_reason, updated_at = now()
    where id = p_reservation_id;

  return true;
end;
$$;

revoke all on function public.dm_cancel_reservation(uuid, text) from public;
grant execute on function public.dm_cancel_reservation(uuid, text) to authenticated;
