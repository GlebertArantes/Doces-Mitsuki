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

## Branches

- `main`: branch de publicação/deploy — é o que o Cloudflare Pages usa como origem.
- `claude/ecstatic-curie-0kjnzw`: branch de desenvolvimento desta sessão. O repositório estava
  vazio quando o projeto começou, então o primeiro commit foi enviado só para essa branch, e o
  GitHub acabou marcando-a como padrão por ser a única existente. `main` foi criada a partir do
  mesmo commit para corrigir isso; a cada rodada de mudanças, `main` é atualizada a partir da branch de
  desenvolvimento. Se o GitHub ainda mostrar `claude/ecstatic-curie-0kjnzw` como branch padrão do
  repositório, troque em Settings → General → Default branch (é uma configuração do repositório,
  não algo que se resolve só com git push).

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
- `dm_resolve_admin_login(...)` / `dm_report_login_result(...)`: suportam o login do painel por
  usuário (ver seção "Login do painel" abaixo).

Migrações em `supabase/migrations/`, aplicadas nesta ordem:
1. `0001_dm_doces_mitsuki_schema.sql`
2. `0002_dm_doces_mitsuki_security_fix.sql` (corrige 2 achados do advisor de segurança:
   a view de relatório rodando como definer, e a função de trigger exposta como RPC pública)
3. `0003_dm_fix_reservation_item_order.sql` (corrige bug encontrado em teste: os itens da
   reserva eram inseridos antes da própria reserva existir, violando a FK)
4. `0004_dm_admin_tenant_access_and_flavor_validation.sql` (duas correções de uma revisão
   independente: (a) política de `SELECT` em `tenants` que deixa um membro autenticado do
   tenant ver sua própria loja mesmo com `is_active=false` — sem isso o painel nunca conseguia
   carregar antes da ativação comercial; outros tenants continuam invisíveis, e um usuário sem
   vínculo continua sem ver a loja inativa; (b) validação explícita, dentro de
   `dm_create_reservation`, de que todo sabor escolhido em "monte sua caixinha" pertence ao
   tenant, tem `kind='flavor'` e está `published` — antes disso era possível, por engano ou de
   propósito, colocar o id de outro produto (inclusive de outro tenant) na seleção de sabores)
5. `0005_dm_revoke_anon_cancel_reservation.sql` (endurecimento pedido em revisão: revoga
   `EXECUTE` de `PUBLIC` e de `anon` em `dm_cancel_reservation`, mantendo só `authenticated`.
   A função já checava `is_tenant_admin`/`is_tenant_owner` internamente — um `anon` nunca
   conseguia cancelar nada de fato —, mas agora nem chega a entrar na função: recebe
   `permission denied` antes de qualquer lógica interna rodar. `dm_create_reservation`
   não foi tocada e continua acessível por `anon`, que é quem precisa reservar sem login.)
6. `0006_dm_username_login.sql` (login do painel por usuário em vez de e-mail — ver seção
   "Login do painel" abaixo).

Dados de demonstração em `supabase/seed/demo_catalog.sql` (idempotente, seguro para reexecutar).

## Login do painel

A Mitsuki e os administradores da TaskZap entram no painel com **usuário + senha**, sem e-mail
na tela. Por baixo, quem continua validando a senha é o Supabase Auth de verdade — nada de
checagem de senha em JavaScript ou direto no banco.

Como funciona:
1. Cada pessoa com acesso ao painel tem uma conta Supabase Auth cujo e-mail é um endereço
   **interno/sintético** (ex.: `mitsuki@doces-mitsuki.taskzap.internal`), nunca o e-mail pessoal
   dela — e uma linha em `dm_admin_usernames` associando um "usuário" (ex.: `mitsuki`) a essa
   conta.
2. No login, o painel chama `dm_resolve_admin_login(tenant, usuario)`, que devolve o e-mail
   interno correspondente (ou um erro genérico "usuário ou senha incorretos" se o usuário não
   existir, sem revelar qual dos dois é o problema).
3. O painel então chama `supabase.auth.signInWithPassword({ email, password })` normalmente — é
   o Supabase Auth quem verifica a senha, exatamente como antes.
4. O resultado (sucesso ou falha) é reportado a `dm_report_login_result`, que grava a tentativa.
   Depois de 5 falhas em 15 minutos para o mesmo usuário, `dm_resolve_admin_login` passa a
   recusar novas tentativas (`too_many_attempts`) mesmo com a senha certa, até a janela expirar;
   um login bem-sucedido limpa esse histórico de falhas na hora.
5. A checagem de `tenant_memberships` continua exatamente como antes: mesmo com usuário/senha
   corretos, sem vínculo no tenant o painel nunca é liberado (e o vínculo é revalidado a cada
   `dm_resolve_admin_login`, não só no login inicial — revogar o vínculo de alguém já impede
   login novo imediatamente).

Limitação conhecida: como quem valida a senha é o `supabase.auth.signInWithPassword` chamado
pelo próprio navegador, o e-mail interno resolvido trafega nessa chamada (nunca aparece na tela,
nunca é digitado, mas tecnicamente passa pela rede até o Supabase). Isso é uma troca deliberada
para não precisar de uma Edge Function própria nesta V1; pode ser endurecido depois movendo o
`signInWithPassword` para uma Edge Function que nunca devolve o e-mail ao navegador, se for
necessário.

Criar o acesso de uma pessoa (feito hoje via SQL pela TaskZap, não pelo painel):
```sql
-- 1. criar o usuário no Supabase Auth com um e-mail interno (nunca o pessoal)
-- 2. vincular ao tenant:
insert into tenant_memberships (tenant_id, user_id, role) values ('<tenant_id>', '<user_id>', 'owner');
-- 3. definir o usuário de login:
insert into dm_admin_usernames (tenant_id, username, user_id) values ('<tenant_id>', 'mitsuki', '<user_id>');
```

## Como testar localmente

Sem build step: sirva a pasta com qualquer servidor estático, ex.:

```
npx serve .
```

Abra `/` para a vitrine e `/admin/` para o painel. Como o tenant está `is_active=false`, a
vitrine pública mostrará "Em breve" até a ativação — isso é esperado e é o comportamento de
segurança correto. O painel (`/admin/`), por outro lado, funciona normalmente mesmo com
`is_active=false` para quem tiver uma conta vinculada ao tenant (ver migração 0004).

## Testes executados (procedimento controlado)

Este ambiente não tem saída de rede para `supabase.co` nem para o CDN do supabase-js, então os
testes abaixo foram feitos diretamente no banco (via SQL, simulando os papéis `anon` e
`authenticated`), não pelo navegador. Todos usaram dados fictícios isolados no tenant
`doces-mitsuki` e foram revertidos ao final: tenant de volta para `is_active=false`, loja para
`is_open=false`, estoque restaurado aos valores originais, reservas de teste apagadas, e o
usuário de teste descartável (`auth.users`/`tenant_memberships`) removido.

- Reserva simples (caixinha pronta), idempotência (mesma chave não duplica nem decrementa
  estoque duas vezes), caixinha montada com sabor repetido, geração de código `DM-AAMMDD-NNN`.
- Estoque insuficiente rejeitado com rollback total (nenhuma reserva parcial fica registrada).
- Corrida por última unidade: dois pedidos concorrentes pela mesma unidade não permitem
  sobrevenda.
- **Novo nesta rodada**: seleção de sabor de outro tenant → rejeitada (`invalid_flavor_selection`).
- **Novo nesta rodada**: "kind confusion" — usar o id da própria caixinha pronta como se fosse
  sabor avulso → rejeitada, e confirmado que o estoque da caixinha pronta não foi tocado (esse
  era exatamente o bug real corrigido na migração 0004).
- **Novo nesta rodada**: id de sabor inexistente (UUID aleatório) → rejeitado.
- **Novo nesta rodada**: montagem de caixinha válida (regressão) → continua funcionando após a
  correção.
- **Novo nesta rodada**: acesso ao painel com `is_active=false` — um usuário de teste descartável
  com vínculo (`tenant_memberships`) no tenant consegue ver a linha de `tenants` (o que o
  `admin.js` precisa para depois checar o vínculo); um usuário autenticado sem nenhum vínculo
  continua sem ver a loja inativa; nenhum outro tenant fica exposto.

Não testado (fora do alcance desta sessão): o formulário de login em si no navegador (precisa da
conta real da Mitsuki e de rede até o Supabase, indisponíveis aqui) e o fluxo completo por
Playwright/celular.

**Nesta rodada** (migração 0005, sem tocar em `is_active`/`is_open`, sem ativar reservas):
- `has_function_privilege`: `anon` sem EXECUTE em `dm_cancel_reservation`; `authenticated` com
  EXECUTE; `dm_create_reservation` inalterada (`anon` e `authenticated` continuam podendo).
- Em runtime, simulando `role anon`: chamar `dm_cancel_reservation` retorna
  `permission denied for function` (nem entra na função); chamar `dm_create_reservation` chega
  à lógica interna normalmente e retorna `store_not_published` (tenant seguiu inativo).
- Advisor de segurança: o achado "anon pode executar `dm_cancel_reservation`" desapareceu;
  nenhum achado novo apareceu.

**Nesta rodada** (migração 0006, login por usuário, sem tocar em `is_active`/`is_open`):
- Usuário de teste descartável (`auth.users` + `tenant_memberships` + `dm_admin_usernames`),
  removido ao final.
- `dm_resolve_admin_login` com usuário válido → devolve o e-mail interno correto.
- Usuário inexistente → `invalid_credentials` (mensagem genérica, não diz se é o usuário ou a
  senha que está errada).
- 5 falhas reportadas (`dm_report_login_result(..., false)`) → a 6ª chamada de
  `dm_resolve_admin_login` é bloqueada com `too_many_attempts`, mesmo que o usuário/senha
  estivessem certos.
- Reportar um sucesso (`dm_report_login_result(..., true)`) zera o histórico de falhas na hora;
  `dm_resolve_admin_login` volta a funcionar imediatamente.
- Remover o vínculo (`tenant_memberships`) do usuário de teste → `dm_resolve_admin_login` passa a
  recusar mesmo com o usuário existindo (a checagem de vínculo é revalidada a cada tentativa de
  login, não só uma vez).

Não testado (fora do alcance desta sessão): o formulário de login em si no navegador — como
`signInWithPassword` sempre acaba chamando a API do Supabase Auth pela rede, e este ambiente não
tem saída de rede até `supabase.co`, não dá para confirmar aqui, pelo navegador, que a senha
digitada por uma pessoa real é aceita. A lógica de resolução de usuário, bloqueio por tentativas
e checagem de vínculo — que é a parte nova desta rodada — foi validada como descrito acima.

## Pendências para ativação comercial

1. **Conta de administração da Mitsuki**: nenhum usuário Supabase Auth foi criado ainda (sem
   e-mail informado). Quando for criada, o e-mail da conta deve ser um endereço **interno/
   sintético** (ex.: `mitsuki@doces-mitsuki.taskzap.internal`), nunca o e-mail pessoal dela — ver
   seção "Login do painel" acima para o passo a passo (criar o usuário, vincular em
   `tenant_memberships`, definir o `username` em `dm_admin_usernames`).
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
