-- Doces Mitsuki (NK Doces) — atomic product creation for the new admin
-- "+ Cadastrar produto" flow. Additive only: no existing table, policy or
-- function is altered. Reuses shared public.products/categories and the
-- tenant's own dm_product_ext/dm_stock tables.
--
-- Rationale: creating a product touches three tables (products,
-- dm_product_ext, dm_stock). Doing that as separate client-side calls risks
-- a partial write (e.g. product row created but dm_product_ext insert
-- fails) that would leave an inconsistent, possibly duplicate-prone row.
-- This RPC wraps all three inserts in a single transaction: either the
-- whole product is created (always hidden — publishing is a separate,
-- explicit step) or nothing is written at all.

create or replace function public.dm_admin_create_product(
  p_tenant_slug text,
  p_name text,
  p_description text,
  p_price numeric,
  p_category_id uuid,
  p_kind text,
  p_stock int
) returns table(product_id uuid, slug text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_name text;
  v_base_slug text;
  v_slug text;
  v_suffix int := 0;
  v_product_id uuid;
begin
  select id into v_tenant_id from public.tenants where slug = p_tenant_slug;
  if v_tenant_id is null then
    raise exception 'tenant_not_found';
  end if;

  if not public.can_manage_catalog(v_tenant_id) then
    raise exception 'not_authorized';
  end if;

  if p_kind not in ('flavor', 'ready_box') then
    raise exception 'invalid_kind';
  end if;

  v_name := trim(coalesce(p_name, ''));
  if v_name = '' or char_length(v_name) > 120 then
    raise exception 'invalid_name';
  end if;

  if p_price is null or p_price <= 0 or p_price > 10000 then
    raise exception 'invalid_price';
  end if;

  if p_stock is null or p_stock < 0 or p_stock > 9999 then
    raise exception 'invalid_stock';
  end if;

  if p_category_id is null or not exists (
    select 1 from public.categories
    where id = p_category_id and tenant_id = v_tenant_id and is_active
  ) then
    raise exception 'invalid_category';
  end if;

  -- slugify: lowercase, non-alphanumerics to hyphens, trimmed; disambiguate
  -- collisions within the tenant by appending -2, -3, ...
  v_base_slug := regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g');
  v_base_slug := trim(both '-' from v_base_slug);
  if v_base_slug = '' then
    v_base_slug := 'produto';
  end if;
  v_slug := v_base_slug;
  loop
    exit when not exists (
      select 1 from public.products where tenant_id = v_tenant_id and slug = v_slug
    );
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  end loop;

  insert into public.products (tenant_id, name, slug, description, price, category_id, status)
  values (v_tenant_id, v_name, v_slug, nullif(trim(coalesce(p_description, '')), ''), p_price, p_category_id, 'hidden')
  returning id into v_product_id;

  insert into public.dm_product_ext (product_id, tenant_id, kind)
  values (v_product_id, v_tenant_id, p_kind);

  insert into public.dm_stock (tenant_id, product_id, quantity_available, updated_by)
  values (v_tenant_id, v_product_id, p_stock, auth.uid());

  return query select v_product_id, v_slug;
end;
$$;

revoke all on function public.dm_admin_create_product(text, text, text, numeric, uuid, text, int) from public;
grant execute on function public.dm_admin_create_product(text, text, text, numeric, uuid, text, int) to authenticated;
