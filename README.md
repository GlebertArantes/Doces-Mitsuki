# NK Doces 🍬

Loja mobile da NK Doces (nome comercial; tenant técnico continua `doces-mitsuki`), da TaskZap:
caixinhas prontas, monte sua caixinha (4 docinhos) e avulsos. Retirada com a Mitsuki na Brago;
pagamento Pix com conferência manual.

## Estado do projeto

**Estado atual no Supabase (definido pela TaskZap/cliente, fora desta sessão — não alterado aqui):**
`tenants.is_active = true` (nome comercial já é **NK Doces** no banco) e
`dm_store_status.is_open = true` (reservas **abertas**; essa mudança foi feita fora desta sessão,
não por mim — confirmada por auditoria somente leitura no início desta rodada). Esta sessão não
altera `is_active`, `is_open`, dados de pagamento nem estoque por conta própria — ver também "Loja
sempre disponível" na seção de cadastro de produtos, abaixo, sobre a remoção do controle manual de
abrir/fechar do painel.

Preços e sabores seguem os valores de demonstração do protótipo V3 aprovado, marcados como
`[DEMO]` na descrição — ainda pendentes de confirmação com a Mitsuki.

## Identidade comercial: NK Doces

O nome comercial da loja é **NK Doces** — usado em todo texto visível ao cliente (cabeçalho,
rodapé, títulos de página, metadados, recibo, mensagem do WhatsApp). O nome **"Mitsuki"**
continua usado sempre que o texto se refere à pessoa (ex.: "Oi, eu sou a Mitsuki!", "Retirada com
a Mitsuki"). Nada técnico mudou por causa do rebranding: slug do tenant (`doces-mitsuki`),
`tenant_id`, prefixo de pedido (`DM`), usuário de login (`mitsuki`), nomes de tabela/função/
migração, domínio de publicação (`doces-mitsuki.pages.dev`) e o repositório continuam exatamente
como antes — só textos comerciais/visíveis foram trocados.

O monograma circular (`.seal`) passou de "m" para "NK" (mesmo componente visual, sem redesenho:
só o texto e o tamanho da fonte, para caber duas letras no mesmo círculo).

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
js/config.js          # URL + chave publicável do Supabase + número do WhatsApp (pública, RLS)
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

## Envio do pedido pelo WhatsApp

Depois que a reserva é gravada com sucesso no Supabase (via `dm_create_reservation`), a tela de
confirmação mostra um botão primário **"📲 Enviar pedido pelo WhatsApp"** que abre uma conversa já
preenchida com a Mitsuki, usando o link oficial "click-to-chat" do WhatsApp
(`https://wa.me/<número>?text=<mensagem>`). **Não há API do WhatsApp Business, nem biblioteca de
automação, nem envio automático** — o cliente ainda precisa tocar em "Enviar" dentro do próprio
WhatsApp.

- **Número autorizado da Mitsuki**: `+55 34 98438-8989`, normalizado como `5534984388989` para o
  link `wa.me`. Configurado num único ponto: `WHATSAPP_NUMBER` em `js/config.js`. Não é
  reaproveitado de nenhum outro projeto da TaskZap (Donna Store, Nosso Closet, EB Fit).
- **Mensagem**: montada em `buildWhatsAppMessage()` (`js/store.js`), só com dados reais devolvidos
  pela RPC (`order_code`, `total_cents`) e o carrinho que gerou a reserva (nomes de produto,
  quantidades, sabores). Sabores repetidos numa "monte sua caixinha" são agrupados (ex.: `2x
  Brigadeiro tradicional, 2x Beijinho`) para ficar legível sem inventar plural gramatical
  incerto. Nenhum ID interno, token ou e-mail técnico aparece na mensagem.
- **Sem duplicação de pedido**: o botão do WhatsApp só abre um link — ele nunca chama
  `dm_create_reservation` (nem qualquer outra RPC) de novo. Clicar várias vezes reabre a mesma
  conversa com a mesma mensagem; nenhum estoque é decrementado nem código novo é gerado por causa
  do botão.
- **Gating**: o botão só existe dentro do modal de confirmação, que só é renderizado depois que a
  RPC devolve sucesso — se a reserva falhar, nenhum botão de WhatsApp aparece.
- **Botão secundário "📋 Copiar mensagem"**: copia o mesmo texto pra área de transferência
  (`navigator.clipboard`), com aviso de erro se o navegador recusar — é o caminho alternativo caso
  o WhatsApp não abra automaticamente (bloqueio de pop-up, app não instalado no desktop etc.).
- **Prévia de demonstração (`/demo/`)**: mostra o mesmo botão, mas **desabilitado**, com uma frase
  explicando que o envio real só existe na loja publicada — a demo nunca abre o WhatsApp de
  verdade nem gera uma mensagem com número real, consistente com seu isolamento total do Supabase.

## Cadastro de produtos e fotos pelo painel

A Mitsuki cadastra, edita e publica produtos direto pelo celular, sem depender de deploy ou de
alteração de código.

- **Botão "+ Cadastrar produto"** (painel → "Estoque do dia"): cria docinho avulso (`flavor`) ou
  caixinha pronta (`ready_box`). A "monte sua caixinha" (`buildable_box`) continua a mesma de
  sempre — não é possível criar outra pelo formulário genérico, porque ela usa uma regra própria de
  composição (4 sabores) e não tem estoque direto (usa o dos sabores avulsos). Isso é reforçado no
  banco: a RPC de criação só aceita `p_kind IN ('flavor', 'ready_box')`.
- **Sempre criado Oculto**: `dm_admin_create_product(...)` (nova função `SECURITY DEFINER`, migração
  `0008_dm_admin_create_product.sql`) grava `products` + `dm_product_ext` + `dm_stock` numa única
  transação — ou os três gravam, ou nenhum grava; não existe estado de "produto pela metade". O
  produto nasce sempre `status='hidden'`, mesmo se a Mitsuki tentasse publicar direto (o formulário
  de criação nem oferece essa opção); publicar é um passo separado, explícito, feito depois.
- **Publicar/Ocultar**: botão por produto na lista de estoque, alterna `products.status` entre
  `hidden`/`published`. Antes de publicar, o painel confere (no navegador) que nome, preço e
  estoque estão preenchidos — como a criação já exige tudo isso, na prática isso só protege contra
  edição incompleta feita depois.
- **Categoria**: o formulário lê as categorias reais do tenant (`Caixinhas Prontas`, `Monte sua
  Caixinha`, `Docinhos Avulsos`) direto do banco — nenhum id fixo no código.
- **Slug**: gerado a partir do nome (minúsculas, sem acento/símbolo, hifenizado) dentro da própria
  RPC; colisão dentro do tenant é resolvida acrescentando `-2`, `-3`, etc. automaticamente.
- **Foto**: upload direto do celular, reaproveitando o bucket público `product-media` e a tabela
  `product_media` já existentes (nenhum dos dois foi criado nesta rodada — só passaram a ser
  usados pela NK Doces). Caminho sempre `doces-mitsuki/<product_id>/<nome-aleatório>.<ext>` — o
  primeiro segmento do caminho precisa bater com o slug do tenant, e é isso que a política de
  Storage já existente confere. Aceita JPEG/PNG/WebP até 8&nbsp;MB; fotos HEIC/HEIF do iPhone são
  recusadas com uma mensagem explicando como converter antes (Ajustes → Câmera → Formatos →
  "Mais compatível", ou Editar → Duplicar como JPEG) — nunca finge que o upload funcionou.
  Substituir a foto de um produto **não apaga a antiga até a nova estar gravada e vinculada**: o
  upload novo é enviado e o registro em `product_media` é inserido primeiro; só depois disso dá
  certo é que a foto anterior é desmarcada como capa e removida do Storage. Se qualquer etapa
  falhar no meio do caminho, a foto antiga continua sendo a exibida, e o erro é mostrado com uma
  mensagem clara (nunca uma falsa confirmação de sucesso).
- **Produto sem foto**: mostra um ícone neutro (🍬) no lugar, tanto na vitrine quanto no painel —
  nunca a foto de outro produto nem uma imagem quebrada.
- **Vitrine dinâmica**: `js/store.js` agora busca `product_media` do tenant e prefere a foto de
  capa (`is_cover`) de cada produto; as imagens estáticas antigas (`IMAGE_BY_SLUG`) viraram
  fallback só para os produtos correspondentes (os 5 originais, enquanto não tiverem foto própria
  cadastrada). Cadastro, foto, preço, publicação e estoque aparecem na vitrine só recarregando a
  página — sem novo deploy.
- **Sabor novo entra automaticamente na "monte sua caixinha"**: o montador lê `products.filter(kind
  === 'flavor')` a partir do mesmo carregamento da vitrine — não existe lista separada, então um
  sabor avulso recém-publicado (com estoque) aparece nas opções assim que a página recarrega.
- **Isolamento entre lojas — corrigido nesta rodada**: `product_media.tenant_id` e
  `product_media.product_id` eram duas chaves estrangeiras **independentes** — nada no schema/RLS
  impedia, em tese, gravar `tenant_id` de uma loja apontando para um produto de outra. Confirmado
  por auditoria somente leitura, em duas rodadas seguidas, que **nenhuma linha assim existia**, em
  nenhuma das 435 linhas de `product_media` de todo o projeto (não só NK Doces). A correção — um
  trigger `BEFORE INSERT/UPDATE` em `public.product_media` que rejeita qualquer gravação onde
  `tenant_id` não bata com o dono real do produto — foi validada, recomendada e **aplicada** nesta
  rodada (migração `0009_dm_guard_product_media_tenant.sql`), depois de um teste negativo real (uma
  tentativa de inserção cruzada dentro de uma transação com `ROLLBACK`, nunca commitada) confirmar
  que o trigger bloqueia exatamente o caso indevido. Ela afeta a tabela compartilhada, usada por
  todas as lojas do projeto (Donna Store, EB Fit, Nosso Closet, não só NK Doces) — verificado que a
  contagem de linhas (435) ficou idêntica antes e depois de aplicar, ou seja, nenhum dado existente
  foi tocado; só bloqueia, dali em diante, a combinação indevida.
- **Correção de bug encontrado nesta auditoria (não relacionado a fotos)**: `esc()` em `js/admin.js`
  mapeava `&` para `&lt;` em vez de `&amp;` — um nome de produto com `&` aparecia corrompido no
  painel (embora sem risco de XSS, já que `<`/`>`/`"`/`'` estavam corretos). Corrigido; testado com
  nome contendo `&`, `<script>`, aspas duplas e simples — salva e exibe o texto literal, sem
  executar nada.
- **Correção de bug encontrado nesta auditoria (WhatsApp)**: a "Referência para retirada" digitada
  no checkout aparecia no recibo da tela, mas nunca era passada para `buildWhatsAppMessage()` —
  `js/store.js` corrigido para incluir `*Referência:* <valor>` na mensagem do WhatsApp quando o
  campo é preenchido (linha some da mensagem quando o campo fica em branco, sem inventar valor).

## Ajustes de UX: seleção por quantidade, sem caixinha pronta, loja sempre disponível

Três mudanças de experiência nesta rodada, pedidas depois de testar a versão anterior:

- **Seleção por quantidade antes do carrinho**: no cardápio de avulsos, o antigo botão único "+"
  virou um contador `[-] N [+]` por sabor. Tocar no `+`/`-` só ajusta uma quantidade **pendente**,
  local à tela — nada entra no carrinho ainda, e dá pra escolher vários sabores em quantidades
  diferentes antes de decidir. Quando há pelo menos 1 unidade pendente em qualquer sabor, aparece
  uma barra "Adicionar ao carrinho →" mostrando o total pendente (contagem + valor); tocar nela
  transfere tudo de uma vez para o carrinho de verdade (mesclando com o que já estiver lá) e zera a
  seleção pendente. O carrinho em si continua funcionando exatamente como antes (+/- normais,
  totais, checkout). A "monte sua caixinha" não foi alterada — seu fluxo (escolher 4 sabores no
  modal e tocar "Adicionar caixinha ao carrinho") já era deliberado e continua igual.
- **Caixinha pronta retirada da experiência comercial**: o produto `kind=ready_box` não aparece mais
  na vitrine (nem card, nem filtro, nem texto "Caixinha pronta"), no cadastro genérico do painel
  (que agora só cria `flavor` — a opção "Tipo" foi removida do formulário, já que só existe um tipo
  cadastrável) nem na prévia `/demo/`. **Nenhum dado foi apagado**: o produto `Caixinha pronta · 4
  docinhos` já cadastrado continua existindo em `products`/`dm_product_ext`/`dm_stock` exatamente
  como estava, visível e editável no painel (útil se um dia quiserem reativá-lo) — só não é mais
  renderizado em nenhum código de vitrine/demo, mesmo que continue com `status='published'`. A
  "monte sua caixinha" (`buildable_box`) e os docinhos avulsos (`flavor`) continuam exatamente como
  antes.
- **Loja sempre disponível — sem controle manual de abrir/fechar no painel**: o painel administrativo
  não tem mais a seção "Pronta entrega" com o botão de ligar/desligar vendas. Ao auditar o banco no
  início desta rodada, `dm_store_status.is_open` já estava `true` (mudança feita fora desta sessão,
  não por mim). A decisão técnica foi: **não tocar em `is_open` nem em `dm_store_status`** — a tabela
  e a checagem de segurança dentro de `dm_create_reservation` continuam exatamente como estavam
  (confirmado que a função ainda recusa reservas com `store_closed` se `is_open` alguma vez voltar a
  `false`); só a interface do painel parou de expor um jeito de a Mitsuki mexer nisso sozinha — o
  mesmo padrão já usado para `tenants.is_active` ("é uma decisão comercial, feita pela TaskZap, fora
  do painel"). `dm_store_status` é uma tabela isolada da NK Doces (auditoria confirmou: hoje só
  existe 1 linha no projeto inteiro, a desta loja), então essa mudança de interface não tem nenhum
  efeito sobre outros tenants.
- **Painel — fotos só no formulário**: a listagem principal de produtos/estoque não mostra mais
  miniatura de foto ao lado de cada item (pedido explícito, para deixar a lista mais enxuta no
  celular) — o cadastro, a edição e o upload/troca de foto continuam funcionando normalmente dentro
  do formulário de cada produto, e a foto de capa continua sendo usada normalmente na vitrine.

## Foto do docinho de leite Ninho — pendente por bloqueio de rede

**Duas fontes já foram formalmente aprovadas, em duas rodadas separadas, e nenhuma pôde ser baixada
— o bloqueio é da política de rede deste ambiente, não das fontes escolhidas:**

1. **"Sweet coconut balls topped with white cream"**, por **Jonathan Borba** (@jonathanborba),
   Unsplash License —
   `https://unsplash.com/photos/sweet-coconut-balls-topped-with-white-cream-PzbjGm6EPhE`.
   Bloqueado: `unsplash.com` recusado pelo proxy de saída (`connect_rejected`, política da
   organização) e pela ferramenta de busca de página (`EGRESS_BLOCKED`).
2. **"Brigadeiro de chocolate branco 20190209.jpg"**, por **Londonjackbooks**, Wikimedia Commons,
   licença **CC0 1.0 Universal / Public Domain Dedication** (uso livre, inclusive comercial, sem
   necessidade de autorização) —
   `https://commons.wikimedia.org/wiki/File:Brigadeiro_de_chocolate_branco_20190209.jpg`, arquivo
   original em
   `https://upload.wikimedia.org/wikipedia/commons/9/90/Brigadeiro_de_chocolate_branco_20190209.jpg`.
   Orientação de recorte já definida para quando a foto puder ser baixada: priorizar os três
   brigadeiros brancos da parte superior da imagem, reduzindo/removendo do enquadramento o
   brigadeiro da frente com o detalhe escuro de chocolate. Bloqueado do mesmo jeito: tanto
   `upload.wikimedia.org` quanto `commons.wikimedia.org` e `wikimedia.org` recusados pelo proxy de
   saída (`connect_rejected`, política da organização) e pela ferramenta de busca de página
   (`EGRESS_BLOCKED`) — confirmando que não é um problema específico do Unsplash, e sim uma
   política de rede deste ambiente que bloqueia hosts externos de imagem em geral (o mesmo
   ambiente permite, por exemplo, `github.com` para as operações de git desta sessão, mas não
   hosts genéricos de mídia).

Como pedido explicitamente nos dois anexos, **não substituí por nenhuma outra imagem em nenhuma das
duas tentativas** — a foto provisória atual (`assets/img/ninho.webp`) continua exatamente como
estava desde antes desta sessão.

**Para aplicar a foto aprovada**: alguém com acesso ao ambiente do Claude Code precisa liberar o
domínio da fonte escolhida (`unsplash.com`/`images.unsplash.com` para a opção 1, ou
`upload.wikimedia.org`/`commons.wikimedia.org` para a opção 2 — a mais recente aprovada) nas
configurações de rede do ambiente (menu do ambiente na barra de título da sessão → Editar → Acesso
de rede), e então pedir para eu (ou a próxima sessão) baixar, recortar conforme a orientação acima,
otimizar em WebP e aplicar a imagem — toda a referência (fonte, autor, licença, orientação de
recorte) já está registrada aqui para isso não precisar ser reconfirmado depois. Alternativamente,
qualquer pessoa com acesso à internet pode baixar o arquivo e enviá-lo diretamente nesta conversa
(como imagem, não como link) — nesse caso eu aplico o recorte/otimização sem depender de rede
nenhuma.

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
8. `0008_dm_admin_create_product.sql` (nova função `dm_admin_create_product(...)`, usada pelo botão
   "+ Cadastrar produto" do painel — grava `products` + `dm_product_ext` + `dm_stock` numa única
   transação atômica, sempre com `status='hidden'`, valida nome/preço/estoque/categoria/tipo e
   gera um slug único dentro do tenant. Aditiva: nenhuma tabela ou política existente foi tocada.)
9. `0009_dm_guard_product_media_tenant.sql` (trigger `BEFORE INSERT/UPDATE` em `public.product_media`
   que rejeita qualquer linha cujo `tenant_id` não bata com o `tenant_id` real do produto referenciado
   — fecha a lacuna de isolamento entre lojas encontrada em auditoria. Afeta a tabela compartilhada,
   usada por todas as lojas do projeto, não só NK Doces; validada e recomendada em duas rodadas de
   auditoria (0 violações em 435 linhas, nas duas vezes) e testada com uma tentativa negativa real
   dentro de transação com `ROLLBACK` antes de aplicar — ver seção "Ajustes de UX" acima.)

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

Abra `/` para a vitrine e `/admin/` para o painel. O tenant está `is_active=true` (vitrine
publicada, visível a qualquer visitante), mas `dm_store_status.is_open=false`: o cardápio aparece
normalmente, só reservas novas é que o RPC recusa até a Mitsuki reabrir as vendas.

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

**Nesta rodada** (rebranding para NK Doces + envio de pedido pelo WhatsApp — sem tocar em
`is_active`/`is_open`, sem registrar pedido real, sem tocar em dados de outros tenants):

Mesmo procedimento das rodadas anteriores: servidor HTTP local + Chromium real via Playwright,
com o módulo `supabase-client.js` interceptado e substituído por um mock em memória (sem nenhuma
chamada real a `supabase.co`), já que este ambiente não tem saída de rede para lá. 55 verificações
automatizadas, todas aprovadas:

- **Rebranding**: `grep` em todos os arquivos visíveis ao cliente (`index.html`, `admin/index.html`,
  `demo/index.html`, `js/store.js`, `js/admin.js`, `demo/js/demo-store.js`) confirma **zero**
  ocorrências de "Doces Mitsuki"/"DOCES MITSUKI" restantes; título, `brand-name`, `demo-strip` e
  monograma (`.seal`, agora "NK") verificados em tela real na vitrine, no painel e na prévia. A
  seção "Oi, eu sou a Mitsuki!" (nome da pessoa) continua intacta, como deveria.
- **Terminologia**: campo do checkout confirmado como "Referência para retirada (opcional)" (era
  "Setor / equipe (opcional)"), na vitrine real e na prévia; `grep` confirma zero ocorrências novas
  de "funcionári"/"colaborador"/"empregad".
- **Fluxo completo de reserva + WhatsApp**: carrinho com 2x caixinha pronta + 1x caixinha montada
  (sabores propositalmente repetidos: 2x Brigadeiro, 1x Beijinho, 1x Ninho) → `dm_create_reservation`
  chamada **exatamente uma vez** → botão "📲 Enviar pedido pelo WhatsApp" aparece só depois do
  sucesso da RPC, com `href` `https://wa.me/5534984388989?text=...` (número correto, formato
  oficial). Mensagem decodificada conferida linha a linha contra o template pedido: cabeçalho,
  código de pedido **real** (`#DM-260928-007`, devolvido pela RPC simulada), nome do cliente, itens
  com subtotal correto, sabores repetidos agrupados como `2x Brigadeiro tradicional` (formato
  `NxNome`, escolhido para não arriscar plural gramaticalmente errado em nomes de produto
  arbitrários), total batendo com `total_cents` da RPC, retirada, status de pagamento e observação
  — e **nenhum ID interno de produto** (`prod-*`) vazando no texto.
- **Sem duplicação**: clicar no botão do WhatsApp duas vezes seguidas (incluindo abrir e fechar a
  aba que o `target="_blank"` tentaria abrir) confirmado, por contagem de chamadas RPC
  interceptadas, que **não** dispara uma nova `dm_create_reservation` — o botão é só um link
  estático montado uma vez.
- **Botão "Copiar mensagem"**: clicado, e o conteúdo da área de transferência (mockada via
  permissão do Chromium) conferido como sendo o mesmo texto do link do WhatsApp.
- **Falha de reserva**: RPC simulada devolvendo `insufficient_stock` → confirmado que **nenhum**
  botão de WhatsApp nem tela de sucesso aparece, e que um aviso de erro é mostrado ao cliente.
- **Prévia de demonstração**: confirmado que o botão do WhatsApp aparece **desabilitado**
  (`disabled`), com o texto explicando que o envio real só existe na loja publicada; confirmado que
  a página não referencia `js/config.js` nem `js/supabase-client.js` no HTML servido; monitorando
  **todas** as requisições de rede da aba (não só as de Supabase), zero saíram para fora de
  `localhost:8080` — ou seja, nenhuma chamada de rede de espécie nenhuma, consistente com o
  isolamento total exigido.
- **Layout mobile**: 320/360/375/390/430px + desktop (1280px), nas três páginas (vitrine, painel,
  prévia) — `document.documentElement.scrollWidth` igual a `window.innerWidth` em todos os 18
  casos, zero overflow horizontal após as mudanças de texto/monograma desta rodada.

**Nesta rodada** (cadastro de produtos com foto, vitrine dinâmica, correções de WhatsApp/`esc()` —
sem tocar em `is_active`/`is_open`, sem alterar preços/estoque/Pix existentes, sem tocar em dados de
outras lojas): mesmo procedimento — servidor HTTP local + Chromium real via Playwright, Supabase
mockado em memória (sem chamada real a `supabase.co`). 51 verificações automatizadas, todas
aprovadas (27 de funcionalidade + 24 de overflow):

- **Cadastro sem foto**: `dm_admin_create_product` chamada com dados válidos → produto criado com
  `status='hidden'`, `dm_product_ext.kind='flavor'` e `dm_stock.quantity_available` corretos;
  aparece no painel com a pílula "Oculto" e o ícone de placeholder (sem foto).
- **Validação client-side**: preço `0` e estoque negativo rejeitados **sem sequer chamar a RPC**
  (confirmado contando as chamadas simuladas) — nenhuma tentativa de gravação inválida chega ao
  banco.
- **Nome com `&`, `<script>`, aspas duplas e simples**: salvo e exibido como texto literal no
  painel, sem executar nenhum script (`window.__xss` nunca é definido) e com `&` corretamente
  escapado como `&amp;` no HTML gerado — confirma a correção do bug do `esc()`.
- **Upload de foto no cadastro**: preview aparece assim que o arquivo é escolhido (antes de
  enviar); ao salvar, `storage.upload` é chamado com caminho começando em `doces-mitsuki/`; a linha
  em `product_media` é criada com `is_cover=true` e o `tenant_id` correto; o painel passa a mostrar
  a foto real no lugar do placeholder.
- **HEIC/HEIF**: arquivo `.heic` mostra a mensagem de orientação (conversão no iPhone) assim que
  selecionado, e o campo de arquivo é limpo — nenhuma tentativa de upload é feita.
- **Duplo clique no botão "Cadastrar produto"**: cliques simultâneos resultam em **exatamente um**
  produto criado, não dois — confirma a proteção contra duplo envio.
- **Publicar/Ocultar**: alterna `products.status` para `published`/`hidden` de verdade, e o painel
  reflete a pílula correspondente depois.
- **Categorias reais**: o `<select>` do formulário lista exatamente as categorias do tenant
  simulado (nenhum id fixo).
- **Vitrine prefere foto cadastrada**: produto com linha em `product_media` (`is_cover=true`) mostra
  essa URL na vitrine, não a imagem estática antiga.
- **Produto sem foto não quebra a vitrine**: nenhuma tag `<img>` com `src=""` — mostra o
  ícone/placeholder neutro (`.img-placeholder` ou `.sweet-art`, conforme o card).
- **Sabor novo aparece no montador**: um sabor publicado criado só para o teste aparece na grade de
  sabores da "monte sua caixinha" assim que a vitrine recarrega — sem lista separada para manter.
- **WhatsApp com referência de retirada**: preenchendo "Referência para retirada" no checkout, a
  mensagem gerada inclui `*Referência:* <valor>` — confirma a correção do bug que omitia esse dado.
- **Overflow**: vitrine, lista de estoque do painel, modal "Cadastrar produto" e modal "Editar
  produto" (com o novo campo de foto) — 0 ocorrências de overflow horizontal em 320/360/375/390/
  430px e desktop (1280px), medido por `scrollWidth` vs. `innerWidth`, não inspeção visual.

**Não testado nesta rodada** (mesma limitação de rede das rodadas anteriores, não simulado como se
fosse produção):
- O upload de foto real contra o bucket `product-media` do Supabase e a leitura de volta via
  `getPublicUrl` — o mock simula o retorno da API do Storage, mas não há chamada de rede real nem
  um arquivo realmente salvo no bucket.
- A checagem de isolamento entre tenants no Storage (política de `storage.objects` que exige o
  primeiro segmento do caminho = slug do tenant) foi confirmada por **leitura das políticas via
  auditoria somente leitura no Supabase** (não por uma tentativa real de upload cruzado neste
  ambiente sem rede).
- Conversão real de uma foto HEIC de iPhone (o teste só confirma que a extensão/tipo é rejeitada
  antes do envio, não testa a conversão em si, que fica a critério da Mitsuki).
- O round-trip real contra o Supabase publicado (`dm_create_reservation` de verdade, gerando um
  `order_code` genuíno) — os testes acima usam uma RPC simulada que devolve um código fixo, não uma
  reserva real gravada no banco. Recomendo um teste real, com autorização explícita, quando a
  primeira reserva de teste puder ser feita.
- Abrir o link `wa.me` de fato num WhatsApp instalado (Android/iPhone/desktop) e confirmar que a
  conversa abre com o texto certo já preenchido — testado aqui só até a construção do link e da
  mensagem (comportamento do próprio app WhatsApp ao interpretar o link não pôde ser observado
  sem um dispositivo real).
- As páginas publicadas de verdade em `https://doces-mitsuki.pages.dev` (incluindo `/demo/`) — este
  ambiente não tem saída de rede até `*.pages.dev`, então tudo acima rodou contra uma cópia local
  dos mesmos arquivos, servida por um HTTP server próprio, não contra o deploy real.

**Nesta rodada** (seleção por quantidade, remoção da caixinha pronta, painel sem controle manual de
abrir/fechar, remoção das miniaturas do painel, aplicação da migração de isolamento — sem tocar em
`is_active`/`is_open`, sem alterar preços/estoque/Pix existentes, sem tocar em dados de outras
lojas): mesmo procedimento — servidor HTTP local + Chromium real via Playwright, Supabase mockado
em memória. 36 verificações automatizadas, todas aprovadas:

- **Sem caixinha pronta em lugar nenhum**: com um produto `ready_box` publicado de propósito no
  banco simulado (para confirmar que é o *código*, não a ausência de dado, que impede a exibição),
  a vitrine não renderizou nenhum card nem texto "Caixinha pronta"; o mesmo confirmado na `/demo/`.
- **Seletor de quantidade**: incrementar `+`/`-` em dois sabores diferentes (2 e 3 unidades) manteve
  os contadores independentes e **não tocou o carrinho** (ícone do carrinho continuou zerado) até
  tocar em "Adicionar ao carrinho →"; depois do toque, o carrinho passou a ter as 5 unidades de uma
  vez, a barra de seleção pendente sumiu e os contadores dos cards voltaram a 0 — confirma
  transferência em lote e reset da seleção pendente, exatamente como pedido.
- **Caixinha personalizada intacta**: o fluxo "Montar" (escolher 4 sabores no modal, "Adicionar
  caixinha ao carrinho") continua funcionando sem nenhuma mudança, coexistindo com o novo seletor de
  quantidade dos avulsos.
- **Totais corretos** após transferir uma seleção pendente para o carrinho (2× R$3,50 = R$7,00,
  conferido na tela do carrinho, não só no cálculo interno).
- **Loja sempre disponível**: com `is_open=true` (estado real confirmado por auditoria), o botão
  "Confirmar reserva" segue clicável normalmente, sem nenhum controle manual no caminho.
- **Painel sem "Pronta entrega"**: nem o texto "Pronta entrega" nem o elemento do switch
  (`#toggle-open`) existem mais no HTML renderizado do painel.
- **Painel sem miniaturas**: a listagem de estoque não renderiza nenhum elemento de foto
  (`.inv-thumb`/`.mini-row-media`) — confirmado por contagem zero desses elementos.
- **Cadastro só de avulso**: o formulário "+ Cadastrar produto" não tem mais o campo "Tipo"; um
  produto criado por ele sempre grava `dm_product_ext.kind = 'flavor'` (confirmado direto no banco
  simulado, não só na tela).
- **Upload de foto continua funcionando na edição**, mesmo sem aparecer na listagem — testado
  enviando uma foto no formulário de edição e confirmando a linha criada em `product_media` com
  `is_cover=true`.
- **Isolamento entre tenants (migração aplicada)**: verificado contra o Supabase de verdade (não
  mock) — ver "Ajustes de UX" acima para os detalhes da aplicação e do teste negativo com
  `ROLLBACK`.
- **Overflow**: vitrine com a barra de seleção visível e painel sem o painel de abrir/fechar — 0
  ocorrências em 320/360/375/390/430px e desktop (1280px).

**Não testado nesta rodada** (mesma limitação de rede): o `wa.me` real, o round-trip real de reserva
contra o Supabase publicado, o upload de foto real no bucket, e as páginas publicadas de verdade em
`doces-mitsuki.pages.dev` — mesmas limitações já descritas nas rodadas anteriores.

## Pendências para ativação comercial

1. ~~Conta de administração da Mitsuki~~ — **já existe** (`dm_admin_usernames`, username
   `mitsuki`, 1 conta vinculada ao tenant). Nada a fazer aqui; não recriar nem redefinir a senha
   sem pedido explícito.
2. **Confirmação comercial**: preços reais, sabores definitivos, chave Pix.
3. **Autorização de imagem**: o retrato da Mitsuki usado hoje é um monograma ilustrativo (não é
   uma foto real da proprietária). Substituir só após autorização explícita dela.
4. **Fotos reais dos produtos**: a Mitsuki já pode cadastrar suas próprias fotos pelo painel (ver
   "Cadastro de produtos e fotos" acima); os 5 produtos originais continuam com as imagens
   ilustrativas do protótipo V3 até ela enviar uma foto real de cada um.
5. **Foto do docinho de leite Ninho**: duas fontes já foram **aprovadas**, em duas rodadas (Jonathan
   Borba/Unsplash, e depois Londonjackbooks/Wikimedia Commons CC0 — ver "Foto do docinho de leite
   Ninho — pendente por bloqueio de rede" acima), mas nenhuma pôde ser aplicada: o ambiente onde
   esta sessão roda bloqueia conexões para ambos os domínios por política de rede (confirmado, não
   um erro pontual). Mantive a imagem provisória atual (`assets/img/ninho.webp`) sem alteração nas
   duas tentativas, como pedido explicitamente. Para resolver: libere o domínio da fonte escolhida
   nas configurações de rede do ambiente, ou envie o arquivo de imagem diretamente nesta conversa
   (fonte/autor/licença/orientação de recorte já documentados acima, não precisa reconfirmar).
6. **Teste real do login, do cadastro de produto com foto e do fluxo de WhatsApp pelo navegador**:
   confirmar em `https://doces-mitsuki.pages.dev/admin/` e na vitrine publicada, de um
   navegador/celular real, que o login funciona, que um produto pode ser cadastrado com foto de
   verdade (upload real no bucket), que uma reserva real é criada e que o botão do WhatsApp abre a
   conversa corretamente — ver "Testes executados" acima para o porquê disso não ter sido possível
   validar diretamente desta sessão (sem saída de rede para `supabase.co`/`*.pages.dev`).
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
4. **Verificar se a pasta `demo/` está incluída no deploy**: como não há build step, o Cloudflare
   Pages publica todo o conteúdo do repositório a partir da raiz por padrão — então `demo/` (e
   `index.html`, `admin/`, `css/`, `js/`, `assets/`) deveriam aparecer automaticamente em
   `https://doces-mitsuki.pages.dev/demo/` sem nenhuma configuração extra, **desde que "Build
   output directory" esteja vazio ou como `/`** (Settings → Builds & deployments). Se
   `https://doces-mitsuki.pages.dev/demo/` retornar 404 depois do próximo deploy, o ajuste é trocar
   "Build output directory" para `/` (raiz) nesse mesmo painel — não consigo verificar isso
   programaticamente sem o conector do Cloudflare autorizado nesta sessão (ver item abaixo).
5. Variáveis de ambiente: nenhuma necessária — `js/config.js` já traz a URL, a chave publicável
   do Supabase e o número do WhatsApp (públicos por design; a chave é segura com RLS).

A Edge Function `dm-admin-login` está publicada no Supabase (não no Cloudflare) e já aceita
requisições de `https://doces-mitsuki.pages.dev` e de subdomínios `*.doces-mitsuki.pages.dev`
(previews) — ver `supabase/functions/dm-admin-login/index.ts`, função `isAllowedOrigin`.

## Segurança

Nunca exponha `service_role`, senha do banco ou outras credenciais privadas neste repositório.
A chave em `js/config.js` é a chave publicável (anon), segura para uso no navegador porque o
acesso real é controlado pelas políticas de RLS descritas acima.
