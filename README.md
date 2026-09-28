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

## Layout mobile (overflow horizontal) e nomenclatura "cliente"

Duas correções nesta rodada, sem tocar em lógica de checkout, preços, estoque, permissões ou
regras de reserva:

**Overflow horizontal.** A causa real (confirmada com teste real em navegador, não só leitura de
CSS — ver "Testes executados" abaixo) era um nome de produto ou de cliente comprido, sem espaços
quebráveis, dentro de uma linha `flex` (`.mini-row`, no estoque do painel, e `.order-top`, nas
reservas): o item do flex crescia para caber o texto inteiro em vez de quebrar linha, empurrando o
botão "Editar" e o valor da reserva para fora da tela — em qualquer largura de celular, não só nas
mais estreitas. Corrigido em `css/styles.css`:
- `*{min-width:0}` (regra global) e `overflow-wrap:anywhere` em `body` (herda para todo texto):
  qualquer texto comprido agora quebra em vez de forçar a largura do elemento.
- Grades que ainda usavam `1fr 1fr` sem `minmax(0,1fr)` (`.stats`, `.order-grid`, `.flavor-grid`,
  `.footer-nav`) passaram a usar `repeat(2,minmax(0,1fr))`, o mesmo padrão que `.products` já usava
  corretamente — sem isso, uma célula de grid pode recusar encolher abaixo do conteúdo, com o mesmo
  efeito de estourar a largura.
- `.edit-btn` e o valor da reserva (`.order-top > strong`) ganharam `white-space:nowrap` +
  `flex-shrink:0` explícitos, para que só o texto longo (nome do produto/cliente) quebre — eles
  continuam numa linha só.
- `html, body{overflow-x:hidden}`: rede de segurança padrão contra qualquer resíduo de overflow
  (não desativa o zoom — isso é controlado só pela tag `<meta name="viewport">`, que não foi
  tocada — nem afeta a rolagem vertical da página nem a rolagem horizontal própria de `.seg`, os
  filtros do cardápio, que continua funcionando isoladamente).
- Removida uma regra `.slots{display:grid...}` órfã (sobrava do protótipo, não usada por nenhum
  HTML atual) que colidia com a `.slots`/`.slot` de verdade — usada pelo modal "monte sua
  caixinha" — e mudava seu layout de flex para grid 2 colunas sem necessidade.

**Nomenclatura.** Textos que chamavam quem compra de "funcionários" foram trocados por "clientes"
em `admin/index.html`, `js/admin.js` e neste README (dica da chave Pix, legenda de loja
aberta/fechada, mensagem de "nenhuma reserva ainda", descrição das tabelas). A retirada na Brago
continua mencionada como informação de local de retirada, não como vínculo empregatício.

## Estrutura

```
index.html          # vitrine (loja)
admin/index.html     # painel administrativo (Supabase Auth)
css/styles.css        # identidade visual da V3 aprovada (preservada)
js/config.js          # URL + chave publicável do Supabase (pública, segura com RLS)
js/supabase-client.js
js/store.js            # lógica da vitrine, carrinho, checkout
js/admin.js             # lógica do painel (login por usuário via Edge Function)
assets/img/              # imagens do protótipo V3 extraídas (ilustrativas)
supabase/migrations/      # migrações versionadas (schema aditivo)
supabase/seed/demo_catalog.sql  # dados de demonstração (idempotente)
supabase/functions/dm-admin-login/  # Edge Function que faz o login do painel
demo/index.html         # prévia de demonstração da vitrine, isolada (ver seção "Prévia")
demo/js/demo-data.js     # instantâneo estático do catálogo (sem Supabase)
demo/js/demo-store.js    # cópia adaptada de js/store.js, sem nenhuma chamada de rede
```

Site estático puro (sem build step): pode ser publicado diretamente no Cloudflare Pages.

## Prévia de demonstração (isolada)

Link para testes com a cliente: **`/demo/`** (ex.: `https://doces-mitsuki.pages.dev/demo/`).

Feita para a próxima rodada de testes, **sem nenhuma conexão com o Supabase** — nem leitura, nem
escrita. `demo/index.html` não importa `js/config.js` nem `js/supabase-client.js`; o catálogo vem
de `demo/js/demo-data.js`, um instantâneo estático do catálogo real (lido do banco só para copiar,
em 28/09/2026 — se o catálogo mudar no painel depois, este arquivo precisa ser atualizado à mão,
é o preço de manter a prévia totalmente isolada).

O que funciona na prévia, tudo simulado em memória/`sessionStorage` do próprio navegador:
- ver o catálogo (mesmos produtos/preços/fotos de hoje, marcados `[DEMO]`);
- filtrar por "Caixinhas" / "Avulsos";
- montar uma caixinha com 4 sabores (`monte sua caixinha`);
- adicionar e remover itens do carrinho;
- preencher o formulário de checkout;
- ver uma tela de confirmação simulada, com um código de exemplo `DEMO-AAMMDD-NNN` gerado só no
  navegador (contador reinicia a cada recarregamento da página).

Faixa "✦ DEMONSTRAÇÃO — NENHUM PEDIDO SERÁ REGISTRADO ✦" fixa no topo, mais avisos "demo"/
"simulação" repetidos no carrinho, no checkout e na confirmação.

**Por que é seguro**: a prévia não tem `import` nenhum de `supabase-client.js`, não chama
`fetch`/`rpc` para lugar nenhum, e "confirmar reserva" só gera um texto local — não existe
nenhuma rota de código nela que grave em `dm_reservations`, decremente `dm_stock` ou toque em
qualquer tabela real. Isso significa que ela funciona **mesmo com `is_active=false` e
`is_open=false`** (não depende da loja estar publicada) e que nenhuma política de RLS, nenhuma
checagem de publicação (`store_not_published`) e nenhuma regra de estoque/reserva da loja real
foi tocada, enfraquecida ou contornada — a prévia simplesmente não fala com o banco.

Testado (Chromium real via Playwright, localhost, nas larguras 320/360/375/390/430px + desktop):
catálogo carrega (5 produtos), filtro funciona, montar caixinha com 4 sabores habilita o botão
"adicionar", carrinho soma/remove itens, checkout preenchido e "confirmar" mostra a tela de
simulação com o aviso de demonstração — sem overflow horizontal em nenhuma largura, e **zero
requisições de rede para `supabase.co` ou `esm.sh`** (monitorado via interceptação de todas as
requisições da página durante o teste, não só leitura de código).

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
- `dm_reservations` / `dm_reservation_items`: reservas dos clientes (leitura restrita à
  equipe da loja).
- `dm_sales_report`: view de relatório (staff-only, `security_invoker`).

Funções (`SECURITY DEFINER`, com checagens internas de autorização):
- `dm_create_reservation(...)`: valida loja publicada + aberta + estoque, decrementa estoque e
  gera o código `DM-AAMMDD-NNN` numa única transação atômica. Protegida contra pedido duplicado
  via `idempotency_key`.
- `dm_cancel_reservation(...)`: só para admin/owner do tenant; devolve o estoque e é idempotente
  (cancelar um pedido já cancelado não devolve estoque duas vezes).

O login do painel **não** é feito por uma RPC de banco chamável pelo navegador — ver seção
"Login do painel" abaixo para o porquê e como funciona hoje (Edge Function `dm-admin-login`).

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
6. `0006_dm_username_login.sql` (primeira versão do login por usuário — **substituída pela 0007**,
   ver abaixo; o arquivo é mantido como está, por histórico, não foi reescrito).
7. `0007_dm_secure_admin_login.sql` (corrige um problema de desenho encontrado em revisão na 0006:
   `dm_report_login_result` aceitava um "sucesso" informado pelo próprio navegador — um cliente
   não autenticado podia limpar o histórico de falhas de qualquer usuário ou registrar falhas
   falsas para bloquear alguém legítimo; e `dm_resolve_admin_login` devolvia o e-mail sintético
   para o navegador, que podia então chamar `supabase.auth.signInWithPassword` diretamente,
   contornando por completo o bloqueio por tentativas. As duas funções foram removidas; o login
   passou inteiro para a Edge Function `dm-admin-login` — ver seção "Login do painel" abaixo.
   Também adiciona `source_ip` em `dm_login_attempts`, para um segundo limite por IP.)

Dados de demonstração em `supabase/seed/demo_catalog.sql` (idempotente, seguro para reexecutar).

## Login do painel

A Mitsuki e os administradores da TaskZap entram no painel com **usuário + senha** (mais o botão
de mostrar/ocultar senha) — sem e-mail na tela. Por baixo, quem continua validando a senha é o
Supabase Auth de verdade — nada de checagem de senha em JavaScript ou direto no banco.

### Por que uma Edge Function, e não uma RPC de banco

A primeira versão (migração 0006) usava duas RPCs chamáveis pelo navegador: uma resolvia o
usuário para um e-mail interno, e o navegador então chamava `supabase.auth.signInWithPassword`
ele mesmo e reportava o resultado de volta para o banco. Uma revisão encontrou dois problemas
sérios nesse desenho:

1. **Resultado informado pelo cliente não é prova de nada.** A RPC de "reportar resultado"
   aceitava um `success` vindo do navegador. Qualquer pessoa, sem estar logada, podia chamar essa
   RPC diretamente e mentir: reportar sucesso para limpar o histórico de falhas de qualquer
   usuário, ou reportar falhas falsas em massa para bloquear um usuário legítimo por força bruta
   reversa.
2. **O e-mail resolvido permitia contornar o bloqueio.** Como a RPC de resolução devolvia o
   e-mail sintético para o navegador, quem tivesse esse e-mail em mãos podia chamar
   `supabase.auth.signInWithPassword` diretamente pela API do Supabase, sem nunca passar pela
   nossa RPC — e portanto sem nunca ser contado pelo bloqueio por tentativas.

A correção (migração 0007) elimina as duas RPCs e move o fluxo inteiro para dentro da Edge
Function `dm-admin-login` (`supabase/functions/dm-admin-login`), que roda com a `service_role`
— nunca exposta ao navegador:

1. O navegador manda só `{ tenant_slug, username, password }` para a Edge Function.
2. A função checa, ela mesma, quantas falhas recentes existem para aquele usuário (limite: 5 em
   15 minutos) e para aquele IP de origem (limite: 20 em 15 minutos, contra tentativas
   distribuídas entre vários usuários). Se estourou, recusa (`too_many_attempts`) sem sequer
   consultar a senha.
3. A função resolve o usuário para o e-mail interno **sem nunca devolver esse e-mail ao
   navegador**, e chama `supabase.auth.signInWithPassword({ email, password })` ela mesma,
   servidor-a-servidor. É o Supabase Auth quem segue validando a senha de verdade.
4. A função observa diretamente a resposta do Supabase Auth (não algo que o navegador afirma) e
   grava essa tentativa — sucesso ou falha — em `dm_login_attempts`. Um sucesso limpa na hora o
   histórico de falhas daquele usuário.
5. Só em caso de sucesso a função devolve os tokens de sessão reais ao navegador, que os aplica
   com `supabase.auth.setSession(...)`.
6. A checagem de `tenant_memberships` é feita a cada tentativa (não só no login inicial): revogar
   o vínculo de alguém barra o próximo login imediatamente, mesmo com usuário/senha corretos.

Como o navegador nunca recebe o e-mail nem fala com o Supabase Auth diretamente, não há mais como
contornar o bloqueio "por fora" — todo pedido de login passa, obrigatoriamente, pela Edge
Function.

`dm_login_attempts` não tem nenhuma policy de `INSERT` para `anon`/`authenticated` (só a
`service_role` da Edge Function escreve nela, e ela ignora RLS por natureza) — mesmo que alguém
tentasse escrever direto na tabela para forjar sucesso/falha, a política de RLS recusa.

### Endurecimento da Edge Function (2ª revisão)

Uma segunda revisão encontrou 3 pontos reais na implementação da Edge Function (não no desenho
geral, que continuou correto) e um ponto de documentação:

1. **Erros de banco nas consultas de contagem de tentativas não eram checados.** Se a consulta
   que conta falhas recentes falhasse por qualquer motivo, `count` vinha `undefined`, e
   `undefined ?? 0` virava "zero tentativas" — uma falha de infraestrutura podia, na prática,
   desativar o bloqueio. Agora qualquer erro nessas duas consultas (por usuário e por IP) recusa
   o login com um erro controlado (`service_unavailable`, HTTP 503) em vez de seguir como se não
   houvesse tentativas.
2. **A gravação da tentativa não era conferida.** Um login com senha certa que não conseguisse
   gravar o registro de segurança em `dm_login_attempts` ainda devolvia sucesso ao navegador.
   Agora, se essa gravação falhar, o login É RECUSADO mesmo com a senha certa — a sessão que o
   Supabase Auth já tinha emitido é descartada (`signOut`) e o navegador recebe
   `service_unavailable`. A gravação de uma tentativa malsucedida que falhe não muda o resultado
   (já era uma recusa), mas fica registrada nos logs da função para investigação.
3. **O IP de origem vinha de `x-forwarded-for` sem qualquer tratamento**, usando o primeiro valor
   da cadeia — que é exatamente o valor mais fácil de um cliente forjar. A função agora usa o
   ÚLTIMO valor da cadeia (mais próximo do que a infraestrutura da Supabase realmente observou, no
   padrão usual de proxies que acrescentam ao final) e valida que parece um IP de verdade antes de
   usar. Ainda assim, **não há confirmação oficial de que a infraestrutura de Edge Functions da
   Supabase segue exatamente esse padrão** — por isso o limite por IP é tratado como uma camada
   adicional, nunca a fronteira de segurança principal. A defesa que não depende de rede nenhuma é
   o limite por usuário (5 falhas/15min), que continua valendo mesmo que o IP observado seja
   totalmente forjável.
4. **O e-mail sintético não deve seguir um padrão previsível.** Este README é público (o
   repositório é público) e documenta o formato `usuario@dominio-interno` como exemplo — o que
   significa que o *padrão* não é segredo, só o valor específico de cada conta. Ver recomendação
   concreta na seção "Criar o acesso de uma pessoa" abaixo.

### Proteções nativas do Supabase Auth, Cloudflare Turnstile e risco residual do e-mail

O Supabase Auth já aplica seus próprios limites de tentativas de login a nível de projeto — isso
é uma configuração **global**, compartilhada com Nosso Closet, Donna Store e EB Fit, e não foi
alterada aqui (mudar isso exigiria avaliar o impacto nos outros clientes, fora do escopo desta
tarefa). O bloqueio por usuário/IP desta seção é adicional a isso, não um substituto.

A função já tem o ponto de extensão para exigir um token do **Cloudflare Turnstile** antes de
tentar a senha (`verifyTurnstile`, controlado pelo secret `DM_TURNSTILE_SECRET_KEY` da função) —
mas nenhum site key/secret do Turnstile foi criado para a Doces Mitsuki ainda, então essa
checagem fica pulada até alguém configurar o secret. Recomendo ativar isso antes de abrir a loja
para pedidos reais, se o volume de tentativas de login justificar; não é bloqueante para o V1.

**Risco residual, documentado explicitamente (não "impossível de descobrir"):** o desenho desta
função impede o navegador de aprender o e-mail sintético através do fluxo de login normal, mas
não impede alguém de tentar *adivinhar* esse e-mail e chamar `supabase.auth.signInWithPassword`
diretamente contra a API pública do Supabase Auth, por fora da nossa Edge Function e do nosso
bloqueio por tentativas. Se isso acontecer, quem protege é inteiramente o Supabase Auth em si —
suas proteções globais de rate limiting (não alteradas por nós, compartilhadas com os outros
tenants) e, se ativado no futuro, o "Leaked Password Protection" do projeto (também uma
configuração global, hoje desligada — ver advisor de segurança; ativá-la afeta todos os tenants
e não foi feito aqui sem essa avaliação de impacto). A mitigação que está sob nosso controle total
é tornar o e-mail difícil de adivinhar: ver a recomendação de e-mail aleatório/opaco abaixo, em
vez de um padrão previsível a partir do usuário.

### Recuperação de senha

O e-mail da conta é um endereço interno/sintético — ninguém lê essa caixa de entrada, então o
fluxo padrão do Supabase ("te mandamos um link por e-mail") não serve aqui. Procedimento adotado:
**a redefinição de senha é feita por um administrador da TaskZap direto no painel do Supabase**
(Dashboard → Authentication → Users → selecionar a conta → "Reset password" / definir nova
senha), nunca pelo próprio painel da loja. Isso é seguro porque só quem já tem acesso ao projeto
Supabase (equipe TaskZap) consegue fazer isso — não é self-service, e não depende de e-mail
nenhum. Na prática: se a Mitsuki esquecer a senha, ela avisa a TaskZap (WhatsApp, por exemplo), e
um administrador troca a senha dela pelo Dashboard.

### Criar o acesso de uma pessoa

Feito hoje via SQL pela TaskZap (não existe tela para isso no painel — é intencional, só quem já
tem acesso ao Supabase pode criar novos acessos).

**Importante sobre o e-mail:** use um endereço **aleatório/opaco**, não um padrão previsível a
partir do usuário (nunca `mitsuki@algumacoisa`) — este README é público, então qualquer padrão
"usuario@domínio" documentado aqui deixa de ser segredo no dia em que alguém ler o repositório.
Um UUID aleatório como parte local (ex.: `f3a9c1e2-7b4d-4e6a-9c2f-1d8e5b3a7c90@doces-mitsuki-auth.invalid`)
não tem relação nenhuma com o `username` de login, então adivinhar um não ajuda a adivinhar o
outro:

```sql
-- 1. criar o usuário no Supabase Auth (Dashboard → Authentication → Users → Add user) com um
--    e-mail ALEATÓRIO/OPACO, nunca o pessoal e nunca baseado no username, ex.:
--    f3a9c1e2-7b4d-4e6a-9c2f-1d8e5b3a7c90@doces-mitsuki-auth.invalid
--    (gere um UUID novo para cada conta; o domínio ".invalid" é reservado pela RFC 2606 e
--    nunca resolve de verdade, então não há risco de alguém registrar esse domínio depois)
-- 2. vincular ao tenant:
insert into tenant_memberships (tenant_id, user_id, role) values ('<tenant_id>', '<user_id>', 'owner');
-- 3. definir o usuário de login (esse sim pode ser memorável, é só o "usuário" que a pessoa digita):
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

**Rodada anterior, migração 0006** (desenho substituído pela 0007 logo em seguida — resultados
mantidos aqui só por histórico, o fluxo testado abaixo não existe mais):
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

**Nesta rodada** (migração 0007 + Edge Function `dm-admin-login`, corrigindo o desenho da 0006;
sem tocar em `is_active`/`is_open`, sem ativar reservas, sem tocar em dados de outros tenants):

- Confirmado que `dm_resolve_admin_login` e `dm_report_login_result` não existem mais
  (`function ... does not exist`) — o vetor de vazamento de e-mail e o de "resultado informado
  pelo cliente" foram removidos, não só neutralizados.
- **Tentativa de informar sucesso falso**: `insert into dm_login_attempts (..., success=true)`
  como `anon` → recusado pela RLS (`new row violates row-level security policy`). Sem policy de
  `INSERT` para `anon`/`authenticated`, só a Edge Function (via `service_role`) escreve na
  tabela.
- **Tentativa de bloquear indevidamente outro usuário**: mesmo teste com `success=false` → também
  recusado pela RLS, pelo mesmo motivo.
- Usuário de teste descartável (`auth.users` + `tenant_memberships` + `dm_admin_usernames`, senha
  real via `pgcrypto`/`crypt()` — a mesma função de hash que o Supabase Auth usa), removido ao
  final:
  - **Usuário e senha corretos**: reproduzindo exatamente as consultas que a Edge Function faz
    (usuário → conta, conta → vínculo no tenant, `crypt(senha, encrypted_password) =
    encrypted_password`) → todas as etapas passam, confirmando que o caminho de sucesso está
    correto.
  - **Senha incorreta**: mesma comparação com a senha errada → `false`, como esperado.
  - **Usuário inexistente**: `select ... from dm_admin_usernames where username = '...'` → vazio,
    caminho de `invalid_credentials` da função.
  - **Usuário sem vínculo com o tenant**: removendo a linha de `tenant_memberships` do usuário de
    teste, a consulta de vínculo que a função faz devolve `false` mesmo com usuário/senha
    corretos — confirma que a checagem de vínculo continua bloqueando o acesso.
  - **Bloqueio por tentativas**: inserindo 5 falhas (como a Edge Function faria, via contexto
    equivalente ao `service_role`) para o mesmo usuário, a contagem que a função usa para decidir
    o bloqueio (`>= 5 falhas em 15 minutos`) já acusa o limite atingido.
- **Tentativa de contornar o bloqueio chamando o Supabase Auth diretamente**: não é mais possível
  pela mesma via da 0006, porque o navegador nunca recebe o e-mail (confirmado por leitura do
  código da função: a única informação devolvida em caso de sucesso são os tokens de sessão; em
  caso de erro, só um código genérico). Continua existindo o risco genérico e não específico
  desta implementação de alguém *adivinhar* o formato do e-mail sintético e tentar autenticar
  direto contra o Supabase Auth — esse risco é do domínio do Supabase Auth em si (suas próprias
  proteções globais de tentativas), não algo que esta função possa impedir sem alterar
  configuração global (fora do escopo aqui, ver seção "Login do painel").
- Advisor de segurança re-executado: os achados de `dm_resolve_admin_login`/
  `dm_report_login_result` desapareceram (as funções não existem mais); nenhum achado novo.

Não testado (mesma limitação das rodadas anteriores): o login em si pelo navegador, de ponta a
ponta contra a Edge Function publicada — este ambiente não tem saída de rede até `supabase.co`
nem até o domínio das Edge Functions, então não há como fazer uma chamada HTTP real daqui. Toda a
lógica de que a função depende (consultas, contagens, comparação de senha) foi validada
diretamente no banco, como descrito acima; falta a confirmação, por uma pessoa com navegador e
rede reais, de que a tela de login funciona de ponta a ponta e de que o painel carrega
normalmente depois — recomendo testar em `https://doces-mitsuki.pages.dev/admin/` assim que a
conta definitiva da Mitsuki existir.

**Nesta rodada** (endurecimento da Edge Function — tratamento de erros, confirmação de gravação,
IP confiável — sem tocar em `is_active`/`is_open`, sem ativar reservas, sem tocar em dados de
outros tenants):

Antes de testar, confirmei de novo se este ambiente ganhou saída de rede desde a rodada anterior:
```
curl https://bydqpemkvljwvuakgcxu.supabase.co/functions/v1/dm-admin-login → connect_rejected (403 do proxy de saída)
curl https://doces-mitsuki.pages.dev/                                     → connect_rejected
curl https://example.com/ (domínio genérico, de controle)                  → connect_rejected
```
O terceiro teste (um domínio qualquer, sem relação com este projeto) confirma que o bloqueio é uma
política geral de saída de rede deste ambiente, não algo específico do Supabase ou do Cloudflare —
**não há como fazer nenhuma chamada HTTP real daqui**, para lugar nenhum. Isso não é uma
simulação: é a confirmação de que os testes de HTTP/navegador pedidos **não puderam ser
executados nesta sessão**, e não devem ser considerados aprovados com base em SQL. O que segue
abaixo é o que consegui validar por outros meios — código lido linha a linha e, onde deu, execução
real (não simulação) fora da rede.

- **Falha na consulta do contador de tentativas** / **falha ao registrar uma tentativa**: não há
  como forçar um erro real do PostgREST/Postgres de fora da função sem invocá-la por HTTP. Validado
  só por **leitura do código**: as duas consultas de contagem (`userAttemptsRes`, `ipAttemptsRes`)
  e a gravação em `recordAttempt` agora checam `error` explicitamente e retornam
  `service_unavailable` (ou recusam o sucesso, no caso da gravação) em vez de seguir como se nada
  tivesse acontecido — ver o arquivo `supabase/functions/dm-admin-login/index.ts` e os comentários
  no topo dele. **Isto é revisão de código, não um teste executado.**
- **Tentativa de falsificar o IP**: este *pôde* ser testado de verdade, sem precisar de rede — as
  funções `looksLikeIp`/`extractClientIp` foram reproduzidas em
  `supabase/functions/dm-admin-login/ip-extraction.test.mjs` (`node ip-extraction.test.mjs`,
  Node v22.22.2, disponível neste ambiente) e executadas contra 7 cenários,
  incluindo cadeias de `x-forwarded-for` forjadas pelo "cliente" (múltiplos IPs falsos
  prependados, lixo não numérico, cabeçalho ausente, IPv6). As 7 passaram: a função sempre usa o
  último valor da cadeia (o presumidamente mais confiável) e nunca aceita lixo como IP. Isso testa
  a lógica de extração isoladamente, com código real executado — não testa (não dá pra testar sem
  rede) se a infraestrutura da Supabase de fato preenche esse cabeçalho do jeito que o comentário
  no código presume; esse ponto continua documentado como incerteza, não coberto por este teste.
- Conta administrativa temporária criada só para este teste (`auth.users` + `tenant_memberships` +
  `dm_admin_usernames`, senha real via `pgcrypto`/`crypt`), removida ao final — reproduz as
  consultas que a função faz, mas por SQL direto, não por HTTP:
  - Usuário e senha corretos → todas as etapas (mapeamento, vínculo, hash da senha) conferem.
  - Senha incorreta → comparação de hash falha, como esperado.
  - Usuário inexistente → mapeamento vazio.
  - Usuário sem vínculo com o tenant → removendo `tenant_memberships`, a checagem de vínculo que a
    função faz volta `false` mesmo com usuário/senha corretos.
  - Bloqueio por excesso de tentativas → inserindo 5 falhas, a contagem que decide o bloqueio já
    acusa o limite atingido (mesmo cálculo desta rodada, sem mudança de comportamento aqui).
- **Logout** e **acesso ao painel sem autenticação**: comportamento inalterado desde a rodada
  anterior (`js/admin.js`: `boot()` chama `renderAuthScreen()` quando não há sessão;
  `logout-btn` chama `supabase.auth.signOut()` e volta pra tela de login) — confirmado por
  leitura do código, não há lógica nova aqui para testar nesta rodada, e o mesmo bloqueio de rede
  impede confirmar pelo navegador.

**Resumo honesto**: os testes que dependem de rede real (chamada HTTP à Edge Function publicada,
formulário de login no navegador, painel carregando depois do login) **não foram executados** —
este ambiente não tem saída de rede para lugar nenhum, confirmado com um domínio de controle sem
relação com o projeto. O que foi possível — revisão de código, um teste real de Node.js sem rede
para a lógica de IP, e replicação por SQL das consultas que a função faz — está descrito acima e
não substitui os testes de rede pendentes.

**Nesta rodada** (overflow horizontal e nomenclatura — sem tocar em `is_active`/`is_open`, sem
ativar reservas, sem alterar checkout/preços/estoque/permissões):

Diferente das rodadas anteriores, este teste **não dependia de rede até o Supabase** — só de um
navegador real (Chromium, já pré-instalado neste ambiente) servindo os arquivos localmente. Como
`js/store.js` e `js/admin.js` só renderizam depois de buscar dados do Supabase, e a rede para lá
está bloqueada, criei um módulo substituto do `supabase-js` (interceptando a importação via
`esm.sh`) que devolve dados de teste fixos — incluindo nomes de produto e de cliente propositalmente
compridos e sem espaço, para forçar o cenário de overflow — e rodei a página de verdade num
Chromium real, num servidor HTTP local:
- Larguras testadas: 320, 360, 375, 390, 430px e desktop (1280px), na vitrine e no painel.
- Métrica objetiva: `document.documentElement.scrollWidth` comparado a `window.innerWidth` (mais
  qualquer elemento cujo `getBoundingClientRect()` ultrapassasse a viewport) — não uma inspeção
  visual subjetiva.
- **Antes da correção**: sem overflow na vitrine (cardápio, carrinho, modal de montar caixinha),
  mas overflow real e reproduzível no painel a partir de 320px até 430px (`scrollWidth` chegava a
  504px numa tela de 375px) — o botão "Editar" do estoque ficava fisicamente fora da tela.
  Confirmado que a causa era o nome do produto sem espaços, testado com um item de cardápio real
  fixture criado propositalmente sem espaços.
- **Depois da correção**: 0 ocorrências de overflow em todas as 6 larguras, nas duas páginas,
  inclusive depois de abrir o carrinho e o modal "monte sua caixinha" e escolher um sabor.
- Confirmado que `.seg` (filtros do cardápio) mantém `overflow-x:auto` (rolagem própria intacta) e
  que a tag `<meta name="viewport">` não foi alterada (zoom continua permitido).
- Capturas de tela em 375px conferidas visualmente: o botão "Editar" e o valor da reserva não
  quebram mais linha (ficam numa linha só, como antes), só o texto longo do produto/cliente quebra.
- Terminologia: `grep` confirma zero ocorrências de "funcionári", "colaborador" ou "empregad" em
  todo o repositório (HTML, JS, README, SQL) após as trocas.

Os arquivos de teste (módulo substituto do Supabase, scripts Playwright, capturas de tela) foram
usados só localmente nesta sessão e não foram commitados — não fazem parte do app.

## Pendências para ativação comercial

1. **Conta de administração da Mitsuki**: ainda **não criada**, conforme pedido. Quando for
   criada, o e-mail da conta deve ser um endereço **aleatório/opaco** (ex.: um UUID
   `@doces-mitsuki-auth.invalid`), **não** um padrão previsível a partir do usuário — ver seção
   "Login do painel" acima (subseção "Criar o acesso de uma pessoa") para o passo a passo completo
   e o porquê de evitar um padrão previsível.
2. **Confirmação comercial**: preços reais, sabores definitivos, chave Pix.
3. **Autorização de imagem**: o retrato da Mitsuki usado hoje é um monograma ilustrativo (não é
   uma foto real da proprietária). Substituir só após autorização explícita dela.
4. **Fotos reais dos produtos**: as imagens atuais são ilustrativas (herdadas do protótipo V3),
   não fotografias dos doces realmente vendidos.
5. **Ativação do tenant** (`tenants.is_active=true`): não há política de RLS que permita isso a
   partir do painel — é uma decisão comercial e deve ser feita deliberadamente pela TaskZap fora
   do painel, só depois que os itens acima estiverem resolvidos.
6. **Teste real do login pelo navegador**: assim que a conta definitiva existir, confirmar em
   `https://doces-mitsuki.pages.dev/admin/`, de um navegador/celular real, que o login funciona e
   que o painel carrega — ver "Testes executados" acima para o porquê disso não ter sido possível
   validar daqui.
7. **Cloudflare Turnstile** (opcional): considerar ativar antes de abrir para pedidos reais, se
   fizer sentido pelo volume esperado — ver seção "Login do painel" acima.

## Cloudflare Pages

**Publicado**: https://doces-mitsuki.pages.dev (feito manualmente, fora desta sessão — o
conector do Cloudflare não está autorizado aqui, então não tenho como inspecionar ou alterar a
configuração do projeto Pages diretamente).

Não tenho o conector do Cloudflare autorizado nesta sessão, então não consigo confirmar
programaticamente nem o "production branch" nem qual commit está de fato implantado. A verificar
manualmente no painel do Cloudflare Pages:
1. **Settings → Builds & deployments → Production branch = `main`.** O repositório está com
   `main` e `claude/ecstatic-curie-0kjnzw` sincronizadas no mesmo commit (ver seção "Branches"
   acima e a confirmação no fim deste README), então qualquer uma serviria hoje — mas o combinado
   é `main` ser a branch de produção, e é nela que os próximos pushes de deploy vão parar.
2. **Deployments → o deployment mais recente da `main` deve ter o hash de commit igual ao commit
   atual desta entrega** (o relatório final desta rodada traz o SHA exato). Se o Cloudflare
   mostrar um commit mais antigo como "Production", o deploy automático não disparou — nesse caso,
   um "Retry deployment" ou um novo push vazio resolve.
3. Nenhum build command / diretório raiz como saída (site estático, sem build step).
4. Variáveis de ambiente: nenhuma necessária — `js/config.js` já traz a URL e a chave publicável
   do Supabase (públicas por design, seguras com RLS).

A Edge Function `dm-admin-login` está publicada no Supabase (não no Cloudflare) e já aceita
requisições de `https://doces-mitsuki.pages.dev` e de subdomínios `*.doces-mitsuki.pages.dev`
(previews) — ver `supabase/functions/dm-admin-login/index.ts`, função `isAllowedOrigin`.

## Segurança

Nunca exponha `service_role`, senha do banco ou outras credenciais privadas neste repositório.
A chave em `js/config.js` é a chave publicável (anon), segura para uso no navegador porque o
acesso real é controlado pelas políticas de RLS descritas acima.
