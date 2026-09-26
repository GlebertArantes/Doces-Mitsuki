-- Fix 1: admin.js reads `tenants` by slug before it can check tenant_memberships
-- (it needs tenant.id to query memberships). While doces-mitsuki.is_active=false,
-- the only existing SELECT policy on tenants ("leitura pública de tenants ativos")
-- hides the row from everyone, including real staff, blocking admin login before
-- the store is commercially activated.
--
-- Fix: add an OR'd SELECT policy that lets a signed-in user see a tenant row they
-- already have a tenant_memberships row for, regardless of is_active. This does
-- NOT expose inactive tenants to the public (auth.uid() is null for anon), and
-- does NOT expose other tenants (the exists-check is scoped to that exact tenant
-- id + that exact user id). No existing policy is changed or removed.
drop policy if exists "tenants: membros veem seu tenant mesmo inativo" on public.tenants;
create policy "tenants: membros veem seu tenant mesmo inativo" on public.tenants
  for select using (
    exists (
      select 1 from public.tenant_memberships m
      where m.tenant_id = tenants.id
        and m.user_id = (select auth.uid())
    )
  );

-- Fix 2: dm_create_reservation validated the *shape* of a buildable box's
-- flavor_selection (array length == box_slot_count) but not that each chosen
-- id actually is a published flavor product of THIS tenant. Because a ready_box
-- product also has its own dm_stock row, passing that product's id inside
-- flavor_selection was silently accepted and decremented the wrong stock
-- ("kind confusion"). Cross-tenant ids were already rejected (no matching
-- dm_stock row for this tenant => insufficient_stock), but with a misleading
-- error and no defense-in-depth. This adds an explicit tenant + kind='flavor'
-- + status='published' check before any stock is touched. Atomicity, the
-- oversell guard (UPDATE ... WHERE quantity_available >= needed) and the
-- idempotency_key short-circuit are unchanged.
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
  v_pending_items jsonb := '[]'::jsonb;
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

      v_pending_items := v_pending_items || jsonb_build_object(
        'product_id', v_product.id, 'product_kind', v_ext.kind,
        'product_name_snapshot', v_product.name, 'unit_price_cents', v_unit_cents,
        'quantity', v_qty, 'flavor_selection', null);

    elsif v_ext.kind = 'buildable_box' then
      select array(select (jsonb_array_elements_text(v_item->'flavor_selection'))::uuid) into v_flavor_ids;
      if v_flavor_ids is null or array_length(v_flavor_ids, 1) is distinct from v_ext.box_slot_count then
        raise exception 'invalid_box_composition';
      end if;

      -- explicit defense-in-depth: every chosen id must be a published flavor
      -- product of THIS tenant (blocks kind confusion and cross-tenant ids).
      if exists (
        select 1 from unnest(v_flavor_ids) as chosen(id)
        where not exists (
          select 1
          from public.dm_product_ext e
          join public.products fp on fp.id = e.product_id
          where e.product_id = chosen.id
            and e.tenant_id = v_tenant.id
            and e.kind = 'flavor'
            and fp.tenant_id = v_tenant.id
            and fp.status = 'published'
        )
      ) then
        raise exception 'invalid_flavor_selection';
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

      v_pending_items := v_pending_items || jsonb_build_object(
        'product_id', v_product.id, 'product_kind', v_ext.kind,
        'product_name_snapshot', v_product.name, 'unit_price_cents', v_unit_cents,
        'quantity', v_qty, 'flavor_selection', to_jsonb(v_flavor_ids));
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

  insert into public.dm_reservation_items
    (reservation_id, tenant_id, product_id, product_kind, product_name_snapshot, unit_price_cents, quantity, flavor_selection)
  select
    v_reservation_id, v_tenant.id,
    (item->>'product_id')::uuid, item->>'product_kind', item->>'product_name_snapshot',
    (item->>'unit_price_cents')::bigint, (item->>'quantity')::int,
    nullif(item->'flavor_selection', 'null'::jsonb)
  from jsonb_array_elements(v_pending_items) as item;

  return query select v_order_code, v_reservation_id, v_total_cents;
end;
$$;
