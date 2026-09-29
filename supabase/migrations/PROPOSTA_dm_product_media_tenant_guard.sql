-- PROPOSTA — AINDA NÃO APLICADA AO BANCO.
-- Este arquivo não segue a numeração 000N porque, diferente das demais
-- migrações deste projeto, ela não foi executada. Aguarda aprovação
-- explícita antes de ser aplicada, porque afeta o INSERT/UPDATE da tabela
-- COMPARTILHADA public.product_media — usada por todas as lojas do projeto
-- Supabase (NK Doces, Donna Store, EB Fit, Nosso Closet, etc.), não só por
-- esta.
--
-- Lacuna encontrada na auditoria somente leitura desta rodada:
-- product_media.tenant_id e product_media.product_id são chaves
-- estrangeiras independentes. Nada no schema nem nas políticas de RLS
-- (que hoje só checam can_manage_catalog(tenant_id) na própria linha)
-- impede gravar tenant_id = X apontando para um produto cujo dono real é
-- tenant_id = Y. Uma conta com papel de catálogo em um tenant poderia,
-- por engano ou bug de cliente, vincular mídia a produto de outra loja.
--
-- Verificado: nenhuma linha incorreta existe hoje em toda a tabela
-- (0 casos onde product_media.tenant_id difere do tenant_id do produto
-- referenciado, considerando todos os tenants, não só NK Doces).
--
-- Correção proposta (mínima, aditiva, sem alterar nenhuma coluna ou
-- política existente): um trigger BEFORE INSERT/UPDATE que rejeita
-- qualquer gravação em que product_media.tenant_id não seja exatamente o
-- tenant_id do produto apontado por product_media.product_id.
--
-- Impacto esperado: nenhum, para uso correto (todo INSERT hoje já grava o
-- tenant_id igual ao do produto, inclusive o novo fluxo de upload de foto
-- da NK Doces implementado nesta rodada). O trigger só bloqueia o caso
-- indevido descrito acima, para qualquer tenant. Não apaga, não move e não
-- altera nenhuma linha existente.

create or replace function public.dm_guard_product_media_tenant()
returns trigger
language plpgsql
as $$
declare
  v_product_tenant uuid;
begin
  select tenant_id into v_product_tenant from public.products where id = new.product_id;
  if v_product_tenant is null then
    raise exception 'product_not_found';
  end if;
  if v_product_tenant <> new.tenant_id then
    raise exception 'product_media_tenant_mismatch';
  end if;
  return new;
end;
$$;

drop trigger if exists dm_guard_product_media_tenant on public.product_media;
create trigger dm_guard_product_media_tenant
  before insert or update of tenant_id, product_id on public.product_media
  for each row execute function public.dm_guard_product_media_tenant();
