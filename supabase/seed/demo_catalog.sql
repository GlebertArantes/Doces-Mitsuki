-- Demo catalog for Doces Mitsuki, ported from the approved V3 prototype.
-- Clearly demo data: prices/flavors pending confirmation with the client.
-- Tenant stays is_active=false, so none of this is publicly visible yet.
-- Safe to re-run (idempotent upserts).
do $$
declare
  v_tenant_id uuid := 'fcd11091-0ebc-45a7-9f0b-cf67907ace96';
  v_cat_boxes uuid;
  v_cat_custom uuid;
  v_cat_single uuid;
  v_p_ready uuid;
  v_p_custom uuid;
  v_p_brig uuid;
  v_p_beij uuid;
  v_p_ninho uuid;
begin
  insert into public.categories (tenant_id, name, slug, display_order, is_active)
    values (v_tenant_id, 'Caixinhas Prontas', 'caixinhas-prontas', 1, true)
    on conflict (tenant_id, slug) do update set name = excluded.name
    returning id into v_cat_boxes;
  if v_cat_boxes is null then
    select id into v_cat_boxes from public.categories where tenant_id = v_tenant_id and slug = 'caixinhas-prontas';
  end if;

  insert into public.categories (tenant_id, name, slug, display_order, is_active)
    values (v_tenant_id, 'Monte sua Caixinha', 'monte-sua-caixinha', 2, true)
    on conflict (tenant_id, slug) do update set name = excluded.name
    returning id into v_cat_custom;
  if v_cat_custom is null then
    select id into v_cat_custom from public.categories where tenant_id = v_tenant_id and slug = 'monte-sua-caixinha';
  end if;

  insert into public.categories (tenant_id, name, slug, display_order, is_active)
    values (v_tenant_id, 'Docinhos Avulsos', 'docinhos-avulsos', 3, true)
    on conflict (tenant_id, slug) do update set name = excluded.name
    returning id into v_cat_single;
  if v_cat_single is null then
    select id into v_cat_single from public.categories where tenant_id = v_tenant_id and slug = 'docinhos-avulsos';
  end if;

  insert into public.products (tenant_id, category_id, name, slug, description, price, status, is_featured)
    values (v_tenant_id, v_cat_boxes, 'Caixinha pronta · 4 docinhos', 'caixinha-pronta-4-docinhos',
      'Escolha rápida, já montada para você. [DEMO] preço e sabores a confirmar com a Mitsuki.', 18.00, 'published', true)
    on conflict (tenant_id, slug) do update set name = excluded.name, description = excluded.description, price = excluded.price
    returning id into v_p_ready;
  if v_p_ready is null then select id into v_p_ready from public.products where tenant_id=v_tenant_id and slug='caixinha-pronta-4-docinhos'; end if;

  insert into public.products (tenant_id, category_id, name, slug, description, price, status, is_featured)
    values (v_tenant_id, v_cat_custom, 'Monte sua caixinha · 4 docinhos', 'monte-sua-caixinha-4-docinhos',
      'Escolha quatro sabores, iguais ou diferentes. [DEMO] preço a confirmar com a Mitsuki.', 18.00, 'published', true)
    on conflict (tenant_id, slug) do update set name = excluded.name, description = excluded.description, price = excluded.price
    returning id into v_p_custom;
  if v_p_custom is null then select id into v_p_custom from public.products where tenant_id=v_tenant_id and slug='monte-sua-caixinha-4-docinhos'; end if;

  insert into public.products (tenant_id, category_id, name, slug, description, price, status)
    values (v_tenant_id, v_cat_single, 'Brigadeiro tradicional', 'brigadeiro-tradicional',
      'Uma unidade para adoçar sua pausa. [DEMO] sabor e preço a confirmar.', 4.50, 'published')
    on conflict (tenant_id, slug) do update set name = excluded.name, description = excluded.description, price = excluded.price
    returning id into v_p_brig;
  if v_p_brig is null then select id into v_p_brig from public.products where tenant_id=v_tenant_id and slug='brigadeiro-tradicional'; end if;

  insert into public.products (tenant_id, category_id, name, slug, description, price, status)
    values (v_tenant_id, v_cat_single, 'Beijinho', 'beijinho',
      'Uma unidade para adoçar sua pausa. [DEMO] sabor e preço a confirmar.', 4.50, 'published')
    on conflict (tenant_id, slug) do update set name = excluded.name, description = excluded.description, price = excluded.price
    returning id into v_p_beij;
  if v_p_beij is null then select id into v_p_beij from public.products where tenant_id=v_tenant_id and slug='beijinho'; end if;

  insert into public.products (tenant_id, category_id, name, slug, description, price, status)
    values (v_tenant_id, v_cat_single, 'Docinho de leite Ninho', 'docinho-de-leite-ninho',
      'Uma unidade para adoçar sua pausa. [DEMO] sabor e preço a confirmar.', 4.50, 'published')
    on conflict (tenant_id, slug) do update set name = excluded.name, description = excluded.description, price = excluded.price
    returning id into v_p_ninho;
  if v_p_ninho is null then select id into v_p_ninho from public.products where tenant_id=v_tenant_id and slug='docinho-de-leite-ninho'; end if;

  insert into public.dm_product_ext (product_id, tenant_id, kind, box_slot_count) values
    (v_p_ready, v_tenant_id, 'ready_box', null),
    (v_p_custom, v_tenant_id, 'buildable_box', 4),
    (v_p_brig, v_tenant_id, 'flavor', null),
    (v_p_beij, v_tenant_id, 'flavor', null),
    (v_p_ninho, v_tenant_id, 'flavor', null)
  on conflict (product_id) do update set kind = excluded.kind, box_slot_count = excluded.box_slot_count;

  insert into public.dm_stock (tenant_id, product_id, quantity_available) values
    (v_tenant_id, v_p_ready, 8),
    (v_tenant_id, v_p_brig, 12),
    (v_tenant_id, v_p_beij, 9),
    (v_tenant_id, v_p_ninho, 7)
  on conflict (tenant_id, product_id) do update set quantity_available = excluded.quantity_available;

  insert into public.dm_store_status (tenant_id, is_open, pickup_instructions, pix_key)
    values (v_tenant_id, false, 'Retirada diretamente com a Mitsuki, na Brago.', null)
    on conflict (tenant_id) do nothing;
end $$;
