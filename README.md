# Doces Mitsuki 🍬

Loja mobile da Doces Mitsuki (TaskZap): caixinhas prontas, monte sua caixinha (4 docinhos) e avulsos.
Retirada com a Mitsuki na Brago; pagamento Pix com conferência manual.

## Estado do projeto

**V1 conectada ao Supabase compartilhado da TaskZap, ainda NÃO publicada para pedidos reais.**
O tenant `doces-mitsuki` está com `is_active=false`: o cardápio não é visível publicamente e
o RPC de reserva recusa qualquer pedido até a ativação (`store_not_published`). A loja também
começa com "pronta entrega" fechada (`dm_store_status.is_open=false`).

Preços e sabores seguem os valores de demonstração do protótipo V3 aprovado, marcados como
`[DEMO]` na descrição — ainda pendentes de confirmação com a Mitsuki.

## Estrutura

```
index.html          # vitrine (loja)
admin/index.html     # painel administrativo (Supabase Auth)
css/styles.css        # identidade visual da V3 aprovada (preservada)
js/config.js          # URL + chave publicável do Supabase (pública, segura com RLS)
js/supabase-client.js
js/store.js            # lógica da vitrine, carrinho, checkout
js/admin.js             # lógica do painel
assets/img/              # imagens do protótipo V3 extraídas (ilustrativas)
supabase/migrations/      # migrações versionadas (schema aditivo)
supabase/seed/demo_catalog.sql  # dados de demonstração (idempotente)
```

Site estático puro (sem build step): pode ser publicado diretamente no Cloudflare Pages.

## Backend (Supabase)

Projeto compartilhado da TaskZap: `bydqpemkvljwvuakgcxu`.
Tenant: `doces-mitsuki` (`fcd11091-0ebc-45a7-9f0b-cf67907ace96`), prefixo de pedido `DM`.

Reaproveita as tabelas compartilhadas `tenants`, `categories`, `products`, `product_media`,
`tenant_memberships`, `order_code_counters`. Nenhuma tabela existente foi alterada ou teve
suas políticas modificadas.

Tabelas novas (aditivas, isoladas por `tenant_id`, todas com RLS):
- `dm_product_ext`: marca cada produto como `ready_box` / `buildable_box` / `flavor`.
- `dm_stock`: estoque atual por produto (visível só para quem gerencia o catálogo).
- `dm_availability_public`: projeção pública só com "disponível/esgotado" (sem números),
  mantida em sincronia por trigger.
- `dm_store_status`: loja aberta/fechada para novas reservas + instruções de retirada + Pix.
- `dm_reservations` / `dm_reservation_items`: reservas dos funcionários (leitura restrita à
  equipe da loja).
- `dm_sales_report`: view de relatório (staff-only, `security_invoker`).

Funções (`SECURITY DEFINER`, com checagens internas de autorização):
- `dm_create_reservation(...)`: valida loja publicada + aberta + estoque, decrementa estoque e
  gera o código `DM-AAMMDD-NNN` numa única transação atômica. Protegida contra pedido duplicado
  via `idempotency_key`.
- `dm_cancel_reservation(...)`: só para admin/owner do tenant; devolve o estoque e é idempotente
  (cancelar um pedido já cancelado não devolve estoque duas vezes).

Migrações em `supabase/migrations/`, aplicadas nesta ordem:
1. `0001_dm_doces_mitsuki_schema.sql`
2. `0002_dm_doces_mitsuki_security_fix.sql` (corrige 2 achados do advisor de segurança:
   a view de relatório rodando como definer, e a função de trigger exposta como RPC pública)

Dados de demonstração em `supabase/seed/demo_catalog.sql` (idempotente, seguro para reexecutar).

## Como testar localmente

Sem build step: sirva a pasta com qualquer servidor estático, ex.:

```
npx serve .
```

Abra `/` para a vitrine e `/admin/` para o painel. Como o tenant está `is_active=false`, a
vitrine pública mostrará "Em breve" até a ativação — isso é esperado e é o comportamento de
segurança correto.

## Pendências para ativação comercial

1. **Conta de administração da Mitsuki**: nenhum usuário Supabase Auth foi criado ainda (sem
   e-mail informado). Após receber o e-mail dela, criar o usuário e inserir uma linha em
   `tenant_memberships` (`role='owner'` ou `'admin'`) vinculando-a ao tenant.
2. **Confirmação comercial**: preços reais, sabores definitivos, chave Pix.
3. **Autorização de imagem**: o retrato da Mitsuki usado hoje é um monograma ilustrativo (não é
   uma foto real da proprietária). Substituir só após autorização explícita dela.
4. **Fotos reais dos produtos**: as imagens atuais são ilustrativas (herdadas do protótipo V3),
   não fotografias dos doces realmente vendidos.
5. **Ativação do tenant** (`tenants.is_active=true`): não há política de RLS que permita isso a
   partir do painel — é uma decisão comercial e deve ser feita deliberadamente pela TaskZap fora
   do painel, só depois que os itens acima estiverem resolvidos.
6. **Cloudflare Pages**: publicação ainda não configurada (ver seção abaixo).

## Cloudflare Pages

Ainda não publicado. O conector do Cloudflare não está autorizado nesta sessão. Para publicar:
1. Autorizar o conector do Cloudflare (claude.ai → Configurações → Conectores) ou criar o projeto
   manualmente no painel do Cloudflare Pages.
2. Conectar ao repositório `GlebertArantes/Doces-Mitsuki`, branch `main`, sem build command
   (site estático — diretório raiz).

## Segurança

Nunca exponha `service_role`, senha do banco ou outras credenciais privadas neste repositório.
A chave em `js/config.js` é a chave publicável (anon), segura para uso no navegador porque o
acesso real é controlado pelas políticas de RLS descritas acima.
