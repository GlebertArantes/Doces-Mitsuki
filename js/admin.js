import { supabase } from './supabase-client.js';
import { TENANT_SLUG } from './config.js';

const $ = id => document.getElementById(id);
const money = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

let tenant = null;
let session = null;
let storeStatus = null;
let inventory = [];
let categories = [];
let mediaByProduct = {};
let orders = [];
let toastHandle;

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ACCEPTED_PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function isHeicFile(file) {
  const name = (file.name || '').toLowerCase();
  return /\.(heic|heif)$/.test(name) || file.type === 'image/heic' || file.type === 'image/heif';
}

function coverMedia(productId) {
  const list = mediaByProduct[productId];
  if (!list || !list.length) return null;
  return list.find(m => m.is_cover) || list[0];
}

async function uploadProductPhoto(file, productId) {
  if (isHeicFile(file)) {
    throw new Error('heic_unsupported');
  }
  const ext = ACCEPTED_PHOTO_TYPES[file.type];
  if (!ext) throw new Error('invalid_type');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('too_large');

  const path = `${TENANT_SLUG}/${productId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from('product-media').upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw new Error('upload_failed');

  const { data: pub } = supabase.storage.from('product-media').getPublicUrl(path);
  const publicUrl = pub?.publicUrl;

  const { data: mediaRow, error: insErr } = await supabase.from('product_media').insert({
    tenant_id: tenant.id, product_id: productId, storage_path: path, public_url: publicUrl,
    media_type: 'image', mime_type: file.type, is_cover: true,
  }).select().maybeSingle();

  if (insErr || !mediaRow) {
    await supabase.storage.from('product-media').remove([path]).catch(() => {});
    throw new Error('link_failed');
  }

  const previousCovers = (mediaByProduct[productId] || []).filter(m => m.id !== mediaRow.id);
  if (previousCovers.length) {
    await supabase.from('product_media').update({ is_cover: false }).in('id', previousCovers.map(m => m.id));
    const oldPaths = previousCovers.map(m => m.storage_path).filter(Boolean);
    if (oldPaths.length) await supabase.storage.from('product-media').remove(oldPaths).catch(() => {});
  }

  return mediaRow;
}

const PHOTO_ERROR_MESSAGES = {
  heic_unsupported: 'Fotos em HEIC/HEIF (padrão do iPhone) não são aceitas. No iPhone, vá em Ajustes → Câmera → Formatos e escolha "Mais compatível", ou use Editar → Duplicar como JPEG antes de enviar.',
  invalid_type: 'Envie uma foto em JPEG, PNG ou WebP.',
  too_large: 'A foto é muito grande (máximo 8 MB). Tente uma foto com menos resolução.',
  upload_failed: 'Não foi possível enviar a foto agora. Tente novamente.',
  link_failed: 'A foto foi enviada, mas não pôde ser vinculada ao produto. Tente novamente.',
};

function notify(message) {
  const t = $('toast');
  t.textContent = message;
  t.classList.remove('hidden');
  clearTimeout(toastHandle);
  toastHandle = setTimeout(() => t.classList.add('hidden'), 3400);
}

const LOGIN_ERROR_MESSAGES = {
  invalid_credentials: 'Usuário ou senha incorretos.',
  too_many_attempts: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  captcha_failed: 'Não foi possível confirmar que você não é um robô. Tente novamente.',
  invalid_request: 'Não foi possível entrar. Tente novamente.',
  origin_not_allowed: 'Acesse pelo endereço oficial da lojinha.',
  service_unavailable: 'Não foi possível entrar agora. Tente novamente em instantes.',
};

function renderAuthScreen(errorMessage, submitting) {
  $('admin-view').classList.add('hidden');
  $('auth-view').classList.remove('hidden');
  $('auth-view').innerHTML = `
    <div class="auth-screen">
      <div class="brand" style="justify-content:center"><div class="seal" aria-hidden="true">NK</div><div><div class="brand-name">NK Doces</div><div class="brand-tag">painel administrativo</div></div></div>
      <h1>Entrar</h1>
      <p>Acesso restrito à Mitsuki e a administradores autorizados da TaskZap.</p>
      <form id="login-form">
        <label class="field">Usuário<input type="text" name="username" required autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="32" placeholder="Ex.: mitsuki"></label>
        <label class="field">Senha
          <span style="display:flex;gap:8px">
            <input type="password" name="password" required autocomplete="current-password" style="flex:1" id="login-password">
            <button type="button" class="iconbtn" id="toggle-password" aria-label="Mostrar senha" aria-pressed="false" style="flex-shrink:0">👁️</button>
          </span>
        </label>
        <button class="button full" type="submit" ${submitting ? 'disabled' : ''}>${submitting ? 'Entrando…' : 'Entrar'}</button>
        ${errorMessage ? `<p class="error-text">${esc(errorMessage)}</p>` : ''}
      </form>
    </div>`;
  $('toggle-password').addEventListener('click', () => {
    const input = $('login-password');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    $('toggle-password').setAttribute('aria-pressed', String(!showing));
    $('toggle-password').setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
    $('toggle-password').textContent = showing ? '👁️' : '🙈';
  });
  $('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const username = e.target.elements.username.value.trim().toLowerCase();
    const password = e.target.elements.password.value;
    if (!username || !password) return;
    renderAuthScreen(null, true);
    await attemptLogin(username, password);
  });
}

async function attemptLogin(username, password) {
  // Todo o trabalho sensível (resolver o usuário, checar bloqueio por
  // tentativas, validar a senha no Supabase Auth) acontece dentro da Edge
  // Function dm-admin-login, do lado do servidor. O navegador nunca recebe
  // o e-mail da conta nem decide sozinho se o login deu certo.
  const { data, error } = await supabase.functions.invoke('dm-admin-login', {
    body: { tenant_slug: TENANT_SLUG, username, password },
  });

  if (error) {
    let code = 'invalid_credentials';
    try {
      const errBody = await error.context?.json?.();
      if (errBody?.error) code = errBody.error;
    } catch { /* mantém o código genérico se o corpo do erro não puder ser lido */ }
    return renderAuthScreen(LOGIN_ERROR_MESSAGES[code] || 'Não foi possível entrar. Tente novamente.');
  }

  if (!data?.access_token || !data?.refresh_token) {
    return renderAuthScreen(LOGIN_ERROR_MESSAGES.invalid_credentials);
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: data.access_token, refresh_token: data.refresh_token,
  });
  if (sessionError) return renderAuthScreen(LOGIN_ERROR_MESSAGES.invalid_credentials);
  await boot();
}

async function boot() {
  const { data: { session: s } } = await supabase.auth.getSession();
  session = s;
  if (!session) return renderAuthScreen();

  const { data: tenantRow } = await supabase.from('tenants').select('id, slug, name, is_active, order_code_prefix').eq('slug', TENANT_SLUG).maybeSingle();
  if (!tenantRow) return renderAuthScreen('Tenant NK Doces não encontrado.');
  tenant = tenantRow;

  const { data: membership } = await supabase.from('tenant_memberships').select('role').eq('tenant_id', tenant.id).eq('user_id', session.user.id).maybeSingle();
  if (!membership) {
    await supabase.auth.signOut();
    return renderAuthScreen('Sua conta não tem acesso ao painel da NK Doces. Peça a um administrador da TaskZap para vincular seu usuário.');
  }

  $('auth-view').classList.add('hidden');
  $('admin-view').classList.remove('hidden');
  $('greeting').textContent = 'Olá! ♡';
  await loadAll();
}

async function loadAll() {
  const [{ data: statusRow }, { data: prods }, { data: ext }, { data: stock }, { data: cats }, { data: media }, { data: reservations }, { data: report }] = await Promise.all([
    supabase.from('dm_store_status').select('*').eq('tenant_id', tenant.id).maybeSingle(),
    supabase.from('products').select('id, name, slug, description, price, status, category_id').eq('tenant_id', tenant.id).order('created_at'),
    supabase.from('dm_product_ext').select('*').eq('tenant_id', tenant.id),
    supabase.from('dm_stock').select('*').eq('tenant_id', tenant.id),
    supabase.from('categories').select('id, name').eq('tenant_id', tenant.id).eq('is_active', true).order('display_order'),
    supabase.from('product_media').select('*').eq('tenant_id', tenant.id).order('sort_order'),
    supabase.from('dm_reservations').select('*, dm_reservation_items(*)').eq('tenant_id', tenant.id).order('created_at', { ascending: false }),
    supabase.from('dm_sales_report').select('*').eq('tenant_id', tenant.id).maybeSingle(),
  ]);

  storeStatus = statusRow || { is_open: false, pickup_instructions: '', pix_key: null };
  const extById = Object.fromEntries((ext || []).map(e => [e.product_id, e]));
  const stockById = Object.fromEntries((stock || []).map(s => [s.product_id, s]));
  inventory = (prods || []).map(p => ({ ...p, ext: extById[p.id] || {}, stock: stockById[p.id] || null }));
  categories = cats || [];
  mediaByProduct = {};
  for (const m of (media || [])) (mediaByProduct[m.product_id] ||= []).push(m);
  orders = reservations || [];

  renderSettings();
  renderStats(report);
  renderPublishStatus();
  renderInventory();
  renderOrders();
}

function renderSettings() {
  $('settings-form').elements.pickup.value = storeStatus.pickup_instructions || '';
  $('settings-form').elements.pix.value = storeStatus.pix_key || '';
}

function renderStats(report) {
  const pendentes = report?.total_pendentes ?? 0;
  const recebido = (report?.total_recebido_cents ?? 0) / 100;
  const boxStock = inventory.find(p => p.ext.kind === 'ready_box')?.stock?.quantity_available ?? 0;
  const flavorStock = inventory.filter(p => p.ext.kind === 'flavor').reduce((n, p) => n + (p.stock?.quantity_available ?? 0), 0);
  $('stats').innerHTML = `<div class="stat"><small>Reservas para retirar</small><strong>${pendentes}</strong></div><div class="stat"><small>Pix confirmado</small><strong>${money(recebido)}</strong></div><div class="stat"><small>Caixinhas prontas</small><strong>${boxStock}</strong></div><div class="stat"><small>Docinhos avulsos</small><strong>${flavorStock}</strong></div>`;
}

function renderPublishStatus() {
  $('publish-caption').textContent = tenant.is_active
    ? 'A loja está PUBLICADA: o cardápio é visível publicamente e reservas reais estão liberadas.'
    : 'A loja está EM MODO DE TESTE (não publicada): só quem tem acesso a este painel vê o cardápio. Ativar a publicação é uma decisão comercial e só pode ser feita pela equipe TaskZap, fora deste painel, após sua confirmação final.';
  $('publish-warning').classList.toggle('hidden', tenant.is_active);
}

function renderInventory() {
  $('inventory').innerHTML = inventory.map(p => {
    const kindLabel = { ready_box: 'Caixinha pronta', buildable_box: 'Monte sua caixinha', flavor: 'Avulso' }[p.ext.kind] || '';
    const stockText = p.ext.kind === 'buildable_box' ? 'Usa o estoque dos sabores avulsos' : `${p.stock?.quantity_available ?? 0} un. disponíveis`;
    const catName = categories.find(c => c.id === p.category_id)?.name || '';
    const statusPill = p.status === 'published'
      ? '<span class="status-pill on">Publicado</span>'
      : '<span class="status-pill off">Oculto</span>';
    return `<div class="mini-row"><div><strong>${esc(p.name)}</strong><small>${esc(kindLabel)}${catName ? ' · ' + esc(catName) : ''} · ${stockText} · ${money(p.price)}</small><div>${statusPill}</div></div><div class="mini-row-actions"><button class="edit-btn" data-toggle-publish="${esc(p.id)}">${p.status === 'published' ? 'Ocultar' : 'Publicar'}</button><button class="edit-btn" data-edit-product="${esc(p.id)}">Editar</button></div></div>`;
  }).join('');
}

function editProduct(productId) {
  const p = inventory.find(x => x.id === productId);
  if (!p) return;
  const showStock = p.ext.kind !== 'buildable_box';
  const canChangeCategory = p.ext.kind !== 'buildable_box';
  const cover = coverMedia(productId);
  const catOptions = categories.map(c => `<option value="${esc(c.id)}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  openModal(sheetTitle('Editar produto') + `<form id="edit-product-form" data-id="${esc(productId)}">
    <div class="photo-field">
      ${cover?.public_url ? `<img src="${esc(cover.public_url)}" alt="" class="photo-preview" id="edit-photo-preview">` : `<div class="photo-preview photo-preview-empty" id="edit-photo-preview">🍬</div>`}
      <label class="field" style="flex:1"><span>Foto do produto</span><input type="file" name="photo" accept="image/jpeg,image/png,image/webp,.heic,.heif"></label>
    </div>
    <p class="hint">JPEG, PNG ou WebP, até 8&nbsp;MB. Fotos do iPhone em HEIC precisam ser convertidas antes de enviar.</p>
    <label class="field">Nome<input name="name" maxlength="120" required value="${esc(p.name)}"></label>
    <label class="field">Descrição<textarea name="description" maxlength="240">${esc(p.description || '')}</textarea></label>
    ${canChangeCategory ? `<label class="field">Categoria<select name="category">${catOptions}</select></label>` : ''}
    <label class="field">Preço (R$)<input name="price" inputmode="decimal" required value="${String(p.price).replace('.', ',')}"></label>
    ${showStock ? `<label class="field">Estoque disponível agora<input name="stock" type="number" min="0" max="9999" step="1" required value="${p.stock?.quantity_available ?? 0}"></label>` : ''}
    <p class="hint">Alterar o estoque não modifica reservas já registradas.</p>
    <button class="button full" type="submit" style="margin-top:13px">Salvar alterações</button>
  </form>`);
  $('edit-product-form').elements.photo.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isHeicFile(file)) { notify(PHOTO_ERROR_MESSAGES.heic_unsupported); e.target.value = ''; return; }
    const preview = $('edit-photo-preview');
    const url = URL.createObjectURL(file);
    if (preview.tagName === 'IMG') preview.src = url;
    else { const img = document.createElement('img'); img.className = 'photo-preview'; img.id = 'edit-photo-preview'; img.src = url; preview.replaceWith(img); }
  });
}

function showCreateProductForm() {
  const catOptions = categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  openModal(sheetTitle('Cadastrar produto') + `<p class="extra">O produto é salvo como Oculto. Revise tudo e publique quando estiver pronto.</p><form id="create-product-form">
    <div class="photo-field">
      <div class="photo-preview photo-preview-empty" id="new-photo-preview">🍬</div>
      <label class="field" style="flex:1"><span>Foto do produto (opcional)</span><input type="file" name="photo" accept="image/jpeg,image/png,image/webp,.heic,.heif"></label>
    </div>
    <p class="hint">JPEG, PNG ou WebP, até 8&nbsp;MB. Sem foto, o cardápio mostra um ícone neutro no lugar.</p>
    <label class="field">Nome<input name="name" maxlength="120" required placeholder="Ex.: Cajuzinho"></label>
    <label class="field">Descrição<textarea name="description" maxlength="240" placeholder="Opcional"></textarea></label>
    <p class="hint">Este formulário cadastra docinhos avulsos. A "monte sua caixinha" é uma funcionalidade especial já existente, feita a partir dos sabores avulsos publicados.</p>
    <label class="field">Categoria<select name="category" required><option value="" disabled selected>Escolha uma categoria</option>${catOptions}</select></label>
    <label class="field">Preço (R$)<input name="price" inputmode="decimal" required placeholder="Ex.: 3,50"></label>
    <label class="field">Estoque disponível agora<input name="stock" type="number" min="0" max="9999" step="1" required value="0"></label>
    <button class="button full" type="submit" style="margin-top:13px">Cadastrar produto</button>
  </form>`);
  $('create-product-form').elements.photo.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isHeicFile(file)) { notify(PHOTO_ERROR_MESSAGES.heic_unsupported); e.target.value = ''; return; }
    const preview = $('new-photo-preview');
    const url = URL.createObjectURL(file);
    const img = document.createElement('img');
    img.className = 'photo-preview'; img.id = 'new-photo-preview'; img.src = url;
    preview.replaceWith(img);
  });
}

let creatingProduct = false;
async function createProduct(form) {
  if (creatingProduct) return;
  const name = form.elements.name.value.trim();
  const description = form.elements.description.value.trim();
  const kind = 'flavor';
  const categoryId = form.elements.category.value;
  const rawPrice = form.elements.price.value.trim().replace(/\s/g, '').replace(',', '.');
  const price = Number(rawPrice);
  const stock = Number(form.elements.stock.value);
  const photoFile = form.elements.photo.files?.[0] || null;

  if (!name) return notify('Informe o nome do produto.');
  if (!Number.isFinite(price) || price <= 0 || price > 10000) return notify('Informe um preço válido (maior que zero).');
  if (!Number.isInteger(stock) || stock < 0 || stock > 9999) return notify('Informe um estoque válido.');
  if (!categoryId) return notify('Escolha uma categoria.');
  if (photoFile && isHeicFile(photoFile)) return notify(PHOTO_ERROR_MESSAGES.heic_unsupported);

  creatingProduct = true;
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Cadastrando...'; }

  const { data, error } = await supabase.rpc('dm_admin_create_product', {
    p_tenant_slug: TENANT_SLUG, p_name: name, p_description: description || null,
    p_price: price, p_category_id: categoryId, p_kind: kind, p_stock: stock,
  });

  if (error) {
    creatingProduct = false;
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Cadastrar produto'; }
    const code = (error.message || '').match(/[a-z_]+/)?.[0];
    const map = {
      invalid_name: 'Informe um nome válido.', invalid_price: 'Informe um preço válido.',
      invalid_stock: 'Informe um estoque válido.', invalid_category: 'Escolha uma categoria válida.',
      invalid_kind: 'Tipo de produto inválido.', not_authorized: 'Sua conta não pode cadastrar produtos.',
    };
    return notify(map[code] || 'Não foi possível cadastrar o produto. Tente novamente.');
  }

  const created = Array.isArray(data) ? data[0] : data;
  creatingProduct = false;

  if (photoFile && created?.product_id) {
    try {
      await uploadProductPhoto(photoFile, created.product_id);
    } catch (photoErr) {
      notify('Produto cadastrado (oculto), mas a foto não pôde ser salva: ' + (PHOTO_ERROR_MESSAGES[photoErr.message] || 'tente enviar de novo na edição.'));
      closeModal();
      await loadAll();
      return;
    }
  }

  notify('Produto cadastrado como Oculto! Edite ou publique quando quiser.');
  closeModal();
  await loadAll();
}

async function togglePublish(productId) {
  const p = inventory.find(x => x.id === productId);
  if (!p) return;
  const nextStatus = p.status === 'published' ? 'hidden' : 'published';
  if (nextStatus === 'published') {
    if (!p.name?.trim() || !(Number(p.price) > 0)) return notify('Complete nome e preço antes de publicar.');
    if (p.ext.kind !== 'buildable_box' && (p.stock?.quantity_available == null || p.stock.quantity_available < 0)) {
      return notify('Defina o estoque antes de publicar.');
    }
  }
  const { error } = await supabase.from('products').update({ status: nextStatus }).eq('id', productId);
  if (error) return notify('Não foi possível atualizar a publicação.');
  notify(nextStatus === 'published' ? 'Produto publicado! Já aparece na vitrine.' : 'Produto ocultado da vitrine.');
  await loadAll();
}

function renderOrders() {
  $('orders').innerHTML = orders.length ? orders.map(o => `
    <div class="order-card">
      <div class="order-top"><div><strong>#${esc(o.order_code)} · ${esc(o.customer_name)}</strong><small>${new Date(o.created_at).toLocaleString('pt-BR')}${o.customer_sector ? ' · ' + esc(o.customer_sector) : ''}</small></div><strong>${money(o.total_cents / 100)}</strong></div>
      <div class="order-items">${(o.dm_reservation_items || []).map(l => `${l.quantity}× ${esc(l.product_name_snapshot)}`).join('<br>')}${o.note ? '<br>Obs.: ' + esc(o.note) : ''}</div>
      <div class="order-grid">
        <select aria-label="Status do pedido ${esc(o.order_code)}" data-order-status="${esc(o.id)}" ${o.status === 'cancelado' ? 'disabled' : ''}>
          <option value="recebido" ${o.status === 'recebido' ? 'selected' : ''}>Recebido</option>
          <option value="separado" ${o.status === 'separado' ? 'selected' : ''}>Separado</option>
          <option value="retirado" ${o.status === 'retirado' ? 'selected' : ''}>Retirado</option>
          <option value="cancelado" ${o.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
        </select>
        <button class="paid-toggle ${o.payment_status === 'pago' ? 'yes' : ''}" data-order-paid="${esc(o.id)}" ${o.status === 'cancelado' ? 'disabled' : ''}>${o.payment_status === 'pago' ? '✓ Pix confirmado' : 'Pix pendente'}</button>
      </div>
    </div>`).join('') : '<div class="blank">🧁<br>As reservas dos clientes aparecerão aqui.</div>';
}

function openModal(html) { $('sheet').innerHTML = '<div class="sheet-handle"></div>' + html; $('overlay').classList.remove('hidden'); document.body.classList.add('no-scroll'); }
function closeModal() { $('overlay').classList.add('hidden'); $('sheet').innerHTML = ''; document.body.classList.remove('no-scroll'); }
function sheetTitle(t) { return `<div class="sheet-head"><h2>${t}</h2><button class="close" data-close aria-label="Fechar">×</button></div>`; }

async function saveSettings(form) {
  const pickup = form.elements.pickup.value.trim();
  const pix = form.elements.pix.value.trim();
  if (!pickup) return notify('Informe a orientação de retirada.');
  const { error } = await supabase.from('dm_store_status').upsert({
    tenant_id: tenant.id, is_open: storeStatus.is_open,
    pickup_instructions: pickup, pix_key: pix || null, updated_by: session.user.id,
  }, { onConflict: 'tenant_id' });
  if (error) return notify('Não foi possível salvar. Tente novamente.');
  storeStatus.pickup_instructions = pickup;
  storeStatus.pix_key = pix || null;
  notify('Configurações salvas.');
}

let savingProduct = false;
async function saveProduct(form) {
  if (savingProduct) return;
  const id = form.dataset.id;
  const p = inventory.find(x => x.id === id);
  if (!p) return;
  const name = form.elements.name.value.trim();
  const description = form.elements.description.value.trim();
  const rawPrice = form.elements.price.value.trim().replace(/\s/g, '').replace(',', '.');
  const price = Number(rawPrice);
  const photoFile = form.elements.photo?.files?.[0] || null;
  if (!name) return notify('Informe o nome do produto.');
  if (!Number.isFinite(price) || price <= 0 || price > 10000) return notify('Informe um preço válido.');
  if (photoFile && isHeicFile(photoFile)) return notify(PHOTO_ERROR_MESSAGES.heic_unsupported);

  savingProduct = true;
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Salvando...'; }

  const patch = { name, description, price };
  if (form.elements.category) patch.category_id = form.elements.category.value;
  const { error: prodErr } = await supabase.from('products').update(patch).eq('id', id);
  if (prodErr) {
    savingProduct = false;
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Salvar alterações'; }
    return notify('Não foi possível salvar o produto.');
  }

  if (p.ext.kind !== 'buildable_box') {
    const stock = Number(form.elements.stock.value);
    if (!Number.isInteger(stock) || stock < 0 || stock > 9999) {
      savingProduct = false;
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Salvar alterações'; }
      return notify('Informe um estoque válido.');
    }
    const { error: stockErr } = await supabase.from('dm_stock').upsert({
      tenant_id: tenant.id, product_id: id, quantity_available: stock, updated_by: session.user.id,
    }, { onConflict: 'tenant_id,product_id' });
    if (stockErr) notify('Produto salvo, mas o estoque não pôde ser atualizado.');
  }

  if (photoFile) {
    try {
      await uploadProductPhoto(photoFile, id);
    } catch (photoErr) {
      notify('Dados salvos, mas a foto não pôde ser enviada: ' + (PHOTO_ERROR_MESSAGES[photoErr.message] || 'tente novamente.'));
      savingProduct = false;
      closeModal();
      await loadAll();
      return;
    }
  }

  savingProduct = false;
  notify('Produto atualizado!');
  closeModal();
  await loadAll();
}

async function setOrderStatus(orderId, status) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;
  if (status === 'cancelado') {
    const reason = prompt('Motivo do cancelamento (opcional):') || null;
    const { error } = await supabase.rpc('dm_cancel_reservation', { p_reservation_id: orderId, p_reason: reason });
    if (error) { notify('Não foi possível cancelar: ' + (error.message || '')); return loadAll(); }
    notify('Reserva cancelada e estoque devolvido.');
    return loadAll();
  }
  const patch = { status };
  if (status === 'retirado') patch.picked_up_at = new Date().toISOString();
  const { error } = await supabase.from('dm_reservations').update(patch).eq('id', orderId);
  if (error) { notify('Não foi possível atualizar o status.'); return loadAll(); }
  notify('Status atualizado.');
  await loadAll();
}

async function togglePaid(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order || order.status === 'cancelado') return;
  const nextPaid = order.payment_status !== 'pago';
  const { error } = await supabase.from('dm_reservations').update({
    payment_status: nextPaid ? 'pago' : 'pendente',
    payment_confirmed_at: nextPaid ? new Date().toISOString() : null,
    payment_confirmed_by: nextPaid ? session.user.id : null,
  }).eq('id', orderId);
  if (error) return notify('Não foi possível atualizar o pagamento.');
  notify(nextPaid ? 'Pix marcado como recebido.' : 'Pix marcado como pendente.');
  await loadAll();
}

document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.id === 'logout-btn') { supabase.auth.signOut().then(() => renderAuthScreen()); return; }
  if (b.id === 'new-product-btn') return showCreateProductForm();
  if (b.dataset.editProduct) return editProduct(b.dataset.editProduct);
  if (b.dataset.togglePublish) return togglePublish(b.dataset.togglePublish);
  if (b.dataset.close !== undefined) return closeModal();
  if (b.dataset.orderPaid) return togglePaid(b.dataset.orderPaid);
});
document.addEventListener('change', e => {
  if (e.target.matches('[data-order-status]')) setOrderStatus(e.target.dataset.orderStatus, e.target.value);
});
document.addEventListener('submit', e => {
  if (e.target.id === 'settings-form') { e.preventDefault(); return saveSettings(e.target); }
  if (e.target.id === 'edit-product-form') { e.preventDefault(); return saveProduct(e.target); }
  if (e.target.id === 'create-product-form') { e.preventDefault(); return createProduct(e.target); }
});
$('overlay').addEventListener('click', e => { if (e.target === $('overlay')) closeModal(); });

boot();
