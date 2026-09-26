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
js/admin.js             # lógica do painel (login por usuário via Edge Function)
assets/img/              # imagens do protótipo V3 extraídas (ilustrativas)
supabase/migrations/      # migrações versionadas (schema aditivo)
supabase/seed/demo_catalog.sql  # dados de demonstração (idempotente)
supabase/functions/dm-admin-login/  # Edge Function que faz o login do painel
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

### Proteções nativas do Supabase Auth e Cloudflare Turnstile

O Supabase Auth já aplica seus próprios limites de tentativas de login a nível de projeto — isso
é uma configuração **global**, compartilhada com Nosso Closet, Donna Store e EB Fit, e não foi
alterada aqui (mudar isso exigiria avaliar o impacto nos outros clientes, fora do escopo desta
tarefa). O bloqueio por usuário/IP desta seção é adicional a isso, não um substituto.

A função já tem o ponto de extensão para exigir um token do **Cloudflare Turnstile** antes de
tentar a senha (`verifyTurnstile`, controlado pelo secret `DM_TURNSTILE_SECRET_KEY` da função) —
mas nenhum site key/secret do Turnstile foi criado para a Doces Mitsuki ainda, então essa
checagem fica pulada até alguém configurar o secret. Recomendo ativar isso antes de abrir a loja
para pedidos reais, se o volume de tentativas de login justificar; não é bloqueante para o V1.

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
tem acesso ao Supabase pode criar novos acessos):
```sql
-- 1. criar o usuário no Supabase Auth (Dashboard → Authentication → Users → Add user) com um
--    e-mail interno, nunca o pessoal, ex.: mitsuki@doces-mitsuki.taskzap.internal
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

A verificar manualmente no painel do Cloudflare Pages (Settings → Builds & deployments):
- **Production branch = `main`.** O repositório está com `main` e `claude/ecstatic-curie-0kjnzw`
  sincronizadas no mesmo commit (ver seção "Branches" acima), então qualquer uma serviria hoje —
  mas o combinado é `main` ser a branch de produção, e é nela que os próximos pushes de deploy
  vão parar.
- Nenhum build command / diretório raiz como saída (site estático, sem build step).
- Variáveis de ambiente: nenhuma necessária — `js/config.js` já traz a URL e a chave publicável
  do Supabase (públicas por design, seguras com RLS).

A Edge Function `dm-admin-login` está publicada no Supabase (não no Cloudflare) e já aceita
requisições de `https://doces-mitsuki.pages.dev` e de subdomínios `*.doces-mitsuki.pages.dev`
(previews) — ver `supabase/functions/dm-admin-login/index.ts`, função `isAllowedOrigin`.

## Segurança

Nunca exponha `service_role`, senha do banco ou outras credenciais privadas neste repositório.
A chave em `js/config.js` é a chave publicável (anon), segura para uso no navegador porque o
acesso real é controlado pelas políticas de RLS descritas acima.
