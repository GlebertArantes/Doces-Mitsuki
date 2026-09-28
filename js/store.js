import { supabase } from './supabase-client.js';
import { TENANT_SLUG, WHATSAPP_NUMBER } from './config.js';

const $ = id => document.getElementById(id);
const money = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const IMAGE_BY_SLUG = {
  'caixinha-pronta-4-docinhos': 'assets/img/ready.webp',
  'monte-sua-caixinha-4-docinhos': 'assets/img/custom.webp',
  'brigadeiro-tradicional': 'assets/img/brig.webp',
  'beijinho': 'assets/img/beij.webp',
  'docinho-de-leite-ninho': 'assets/img/ninho.webp',
};
const SWEET_STYLE = {
  'brigadeiro-tradicional': { emoji: '🍫', color: '#855039' },
  'beijinho': { emoji: '🥥', color: '#f1d4a2' },
  'docinho-de-leite-ninho': { emoji: '🥛', color: '#f5d69c' },
};

let tenant = null;       // {id, slug, is_active, order_code_prefix}
let storeStatus = null;  // {is_open, pickup_instructions, pix_key}
let products = [];       // merged products + ext + availability
let cart = [];
let filter = 'all';
let builder = [];
let builderSlots = 4;
let builderBoxProduct = null;
let activeSlot = 0;
let lastReservation = null;
let lastWhatsAppMessage = '';
let toastHandle;

const CART_KEY = 'doces_mitsuki_cart_v1';
function loadCart() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(CART_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}
function persistCart() {
  try { sessionStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* ignore */ }
}
cart = loadCart();

function notify(message) {
  const t = $('toast');
  t.textContent = message;
  t.classList.remove('hidden');
  clearTimeout(toastHandle);
  toastHandle = setTimeout(() => t.classList.add('hidden'), 3400);
}

function idOf(item) {
  if (item.kind === 'ready_box' || item.kind === 'flavor') return item.kind + ':' + item.productId;
  return 'buildable_box:' + item.productId + ':' + item.flavors.slice().sort().join('+');
}
function lineName(item) {
  if (item.kind === 'buildable_box') {
    return item.boxName + ' · ' + item.flavors.map(id => products.find(p => p.id === id)?.name || 'Docinho').join(' + ');
  }
  return item.name;
}
function unitPrice(item) { return item.price; }
function cartCount() { return cart.reduce((n, i) => n + i.qty, 0); }
function cartTotal() { return cart.reduce((n, i) => n + i.qty * unitPrice(i), 0); }

// The public storefront only ever sees "available / sold out" (no numbers).
// The authoritative quantity check always happens server-side, atomically,
// inside dm_create_reservation.

async function loadData() {
  const { data: tenantRow, error: tErr } = await supabase
    .from('tenants').select('id, slug, is_active, order_code_prefix').eq('slug', TENANT_SLUG).maybeSingle();

  if (tErr || !tenantRow) {
    renderUnavailable();
    return;
  }
  tenant = tenantRow;

  const [{ data: statusRow }, { data: cats }, { data: prods }, { data: ext }, { data: avail }] = await Promise.all([
    supabase.from('dm_store_status').select('*').eq('tenant_id', tenant.id).maybeSingle(),
    supabase.from('categories').select('id, name, slug').eq('tenant_id', tenant.id).eq('is_active', true).order('display_order'),
    supabase.from('products').select('id, name, slug, description, price, category_id, status').eq('tenant_id', tenant.id).eq('status', 'published'),
    supabase.from('dm_product_ext').select('*').eq('tenant_id', tenant.id),
    supabase.from('dm_availability_public').select('*').eq('tenant_id', tenant.id),
  ]);

  storeStatus = statusRow || { is_open: false, pickup_instructions: 'Retirada diretamente com a Mitsuki, na Brago.', pix_key: null };
  const extById = Object.fromEntries((ext || []).map(e => [e.product_id, e]));
  const availById = Object.fromEntries((avail || []).map(a => [a.product_id, a.is_available]));

  products = (prods || []).map(p => {
    const e = extById[p.id] || {};
    return {
      id: p.id, name: p.name, slug: p.slug, description: p.description, price: Number(p.price),
      kind: e.kind || 'flavor', boxSlotCount: e.box_slot_count || null,
      isAvailable: e.kind === 'buildable_box' ? null : !!availById[p.id],
      image: IMAGE_BY_SLUG[p.slug] || null,
    };
  });

  if (!tenant.is_active) {
    renderUnavailable();
    return;
  }
  render();
}

function renderUnavailable() {
  $('store-status').classList.remove('closed');
  $('store-status').innerHTML = '<div><strong>Em breve ♡</strong><p>A lojinha da NK Doces ainda está em preparação. Volte em breve!</p></div>';
  $('pickup-wrap').classList.add('hidden');
  $('products').innerHTML = '';
  $('items-pill').textContent = '';
  $('quiet-note').textContent = '';
  $('demo-strip').textContent = '✦ NK DOCES · EM BREVE ✦';
}

function flavorList() { return products.filter(p => p.kind === 'flavor'); }
function canBuildBox(boxProduct) {
  return flavorList().filter(f => f.isAvailable).length > 0; // real check happens server-side
}

function render() {
  const count = cartCount();
  $('cart-dot').textContent = count;
  $('cart-dot').classList.toggle('hidden', !count);
  $('basket-bar').classList.toggle('hidden', !count);
  $('basket-count').textContent = count + ' ' + (count === 1 ? 'item no seu carrinho' : 'itens no seu carrinho');
  $('basket-total').textContent = money(cartTotal());

  const open = !!storeStatus.is_open;
  $('store-status').classList.toggle('closed', !open);
  $('store-status').innerHTML = open
    ? '<div><strong><span class="green-dot"></span>Hoje tem docinhos! 🍬</strong><p>Escolha seus favoritos e reserve para retirada.</p></div><span class="badge">● Aberto</span>'
    : '<div><strong><span class="green-dot"></span>Sem pronta entrega agora</strong><p>Volte quando a Mitsuki abrir as vendas.</p></div><span class="badge">Fechado</span>';
  $('pickup-wrap').classList.remove('hidden');
  $('pickup-display').innerHTML = '📍 Retirada: <b>' + esc(storeStatus.pickup_instructions) + '</b>';

  const p = [];
  if (filter !== 'single') {
    for (const box of products.filter(x => x.kind === 'ready_box')) {
      const left = box.isAvailable;
      p.push(`<article class="product"><div class="product-img"><img src="${box.image || ''}" alt="Imagem ilustrativa de caixinha com quatro docinhos"><span class="photo-overlay"></span><span class="product-ribbon">Caixinha pronta</span></div><div class="product-main"><h3>${esc(box.name)}</h3><p class="product-desc">Escolha rápida, já montada para você.</p><div class="stock ${!left ? 'out' : ''}">${!left ? 'Esgotado' : ''}</div><div class="product-foot"><span class="price">${money(box.price)}</span><button class="addbtn" data-add-ready="${esc(box.id)}" aria-label="Adicionar ${esc(box.name)}" ${!open || !left ? 'disabled' : ''}>+</button></div></div></article>`);
    }
    for (const box of products.filter(x => x.kind === 'buildable_box')) {
      const canBuild = canBuildBox(box);
      p.push(`<article class="product"><div class="product-img"><img src="${box.image || ''}" alt="Imagem ilustrativa de caixinha montada com quatro docinhos variados"><span class="photo-overlay"></span><span class="product-ribbon">Do seu jeito ♡</span></div><div class="product-main"><h3>${esc(box.name)}</h3><p class="product-desc">Escolha quatro sabores, iguais ou diferentes.</p><div class="stock ${!canBuild ? 'out' : ''}">${!canBuild ? 'Esgotado' : ''}</div><div class="product-foot"><span class="price">${money(box.price)}</span><button class="addbtn build" data-build="${esc(box.id)}" ${!open || !canBuild ? 'disabled' : ''}>Montar</button></div></div></article>`);
    }
  }
  if (filter !== 'boxes') {
    for (const s of flavorList()) {
      const left = s.isAvailable;
      const style = SWEET_STYLE[s.slug] || { emoji: '🍬', color: '#9d5f45' };
      p.push(`<article class="product"><div class="product-img tint"><div class="sweet-art" style="--sweet:${esc(style.color)}">${esc(style.emoji)}</div><img class="sweet-photo" loading="lazy" decoding="async" src="${s.image || ''}" alt="Imagem ilustrativa de ${esc(s.name)}" onerror="this.remove()"><span class="photo-overlay"></span><span class="product-ribbon">Avulso</span></div><div class="product-main"><h3>${esc(s.name)}</h3><p class="product-desc">Uma unidade para adoçar sua pausa.</p><div class="stock ${!left ? 'out' : ''}">${!left ? 'Esgotado' : ''}</div><div class="product-foot"><span class="price">${money(s.price)}</span><button class="addbtn" data-add-single="${esc(s.id)}" aria-label="Adicionar ${esc(s.name)}" ${!open || !left ? 'disabled' : ''}>+</button></div></div></article>`);
    }
  }
  $('products').innerHTML = p.join('') || '<div class="blank" style="grid-column:1/-1">Nenhum produto nesta categoria.</div>';
  $('items-pill').textContent = tenant?.is_active ? '' : 'Prévia · não publicado';
  $('quiet-note').textContent = '✦ Preços e sabores em confirmação com a Mitsuki. As fotos são imagens ilustrativas; o retrato da seção "Quem faz" é uma composição estilizada, aguardando autorização de publicação.';
  document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('selected', b.dataset.filter === filter));
}

function addReady(productId) {
  const box = products.find(p => p.id === productId);
  if (!box) return;
  if (!storeStatus.is_open) return notify('As reservas estão fechadas no momento.');
  const key = idOf({ kind: 'ready_box', productId });
  const found = cart.find(i => idOf(i) === key);
  if (found) found.qty++;
  else cart.push({ kind: 'ready_box', productId, name: box.name, price: box.price, qty: 1 });
  persistCart(); render(); notify('Adicionado ao carrinho ♡');
}
function addSingle(productId) {
  const flavor = products.find(p => p.id === productId);
  if (!flavor) return;
  if (!storeStatus.is_open) return notify('As reservas estão fechadas no momento.');
  const key = idOf({ kind: 'flavor', productId });
  const found = cart.find(i => idOf(i) === key);
  if (found) found.qty++;
  else cart.push({ kind: 'flavor', productId, name: flavor.name, price: flavor.price, qty: 1 });
  persistCart(); render(); notify('Adicionado ao carrinho ♡');
}

function openModal(html) {
  $('sheet').innerHTML = '<div class="sheet-handle"></div>' + html;
  $('overlay').classList.remove('hidden');
  document.body.classList.add('no-scroll');
}
function closeModal() {
  $('overlay').classList.add('hidden');
  $('sheet').innerHTML = '';
  document.body.classList.remove('no-scroll');
}
function sheetTitle(t) { return `<div class="sheet-head"><h2>${t}</h2><button class="close" data-close aria-label="Fechar">×</button></div>`; }

function showBuilder(boxProductId) {
  const box = products.find(p => p.id === boxProductId);
  if (!box) return;
  builderBoxProduct = box;
  builderSlots = box.boxSlotCount || 4;
  if (builder.length !== builderSlots) builder = new Array(builderSlots).fill(null);
  const flavors = flavorList();
  const slots = builder.map((chosen, n) => `<button data-slot="${n}" class="slot ${activeSlot === n ? 'active' : ''}" aria-pressed="${activeSlot === n}">${n + 1}º doce: ${chosen ? esc(products.find(p => p.id === chosen)?.name || 'Escolher') : 'Escolher ♡'}</button>`).join('');
  const flavorButtons = flavors.map(s => `<button data-flavor="${esc(s.id)}" class="flavor" ${!s.isAvailable ? 'disabled' : ''}><span class="flavor-pic"><span>${esc((SWEET_STYLE[s.slug] || {}).emoji || '🍬')}</span><img loading="lazy" decoding="async" src="${s.image || ''}" alt="" onerror="this.remove()"></span>${esc(s.name)}<small>${!s.isAvailable ? 'Esgotado' : 'Escolher sabor'}</small></button>`).join('');
  openModal(sheetTitle('Sua caixinha, do seu jeito ♡') +
    `<p class="extra">Escolha ${builderSlots} docinhos. Pode repetir seu favorito, conforme disponibilidade.</p><div class="pick-box"><div class="slot-label">Escolha seus ${builderSlots} sabores</div><div class="slots">${slots}</div></div><div class="slot-label">Sabores do dia</div><div class="flavor-grid">${flavorButtons}</div><div class="sumline"><span>Sua caixinha (${builderSlots} un.)</span><strong>${money(box.price)}</strong></div><button class="button full" id="builder-add" ${builder.every(Boolean) ? '' : 'disabled'}>Adicionar caixinha ao carrinho</button>`);
}

function showCart() {
  if (!cart.length) return notify('Seu carrinho está vazio.');
  openModal(sheetTitle('Seu carrinho 🛍️') + `<p class="extra">Revise seus docinhos antes de reservar.</p>${cart.map(i => `<div class="cart-item"><div><strong>${esc(lineName(i))}</strong><small>${money(unitPrice(i) * i.qty)}</small></div><div class="stepper"><button data-cart-down="${esc(idOf(i))}" aria-label="Diminuir quantidade">−</button><b>${i.qty}</b><button data-cart-up="${esc(idOf(i))}" aria-label="Aumentar quantidade">+</button></div></div>`).join('')}<div class="sumline"><span>Total do pedido</span><strong>${money(cartTotal())}</strong></div><div class="notice">Os preços e sabores ainda estão em confirmação com a Mitsuki.</div><button class="button full" id="go-checkout" ${!storeStatus.is_open ? 'disabled' : ''}>Continuar para reserva →</button>`);
}

function checkout() {
  if (!cart.length) return closeModal();
  openModal(sheetTitle('Finalizar reserva ♡') + `<p class="extra">Preencha seus dados para que a Mitsuki identifique seu pedido na retirada.</p><form id="checkout-form"><label class="field">Seu nome *<input name="customer" required maxlength="60" placeholder="Ex.: Glebert" autocomplete="name"></label><label class="field">Referência para retirada (opcional)<input name="sector" maxlength="60" placeholder="Ex.: Administrativo"></label><label class="field">Observação (opcional)<textarea name="note" maxlength="160" placeholder="Ex.: vou buscar no intervalo"></textarea></label><div class="pick-box"><strong style="font-size:12px">📍 Retirada com a Mitsuki</strong><p class="extra" style="margin:6px 0 0">${esc(storeStatus.pickup_instructions)}</p></div><div class="pick-box"><strong style="font-size:12px">💠 Pagamento: Pix</strong><p class="extra" style="margin:6px 0 0">${storeStatus.pix_key ? 'Você poderá copiar a chave Pix na confirmação.' : 'Chave Pix ainda não cadastrada. Combine o pagamento diretamente com a Mitsuki.'}</p></div><div class="sumline"><span>Total</span><strong>${money(cartTotal())}</strong></div><div class="notice">O pagamento não é verificado automaticamente. A Mitsuki confirma o recebimento no painel.</div><button class="button full" type="submit">Confirmar reserva</button></form>`);
}

let submitting = false;
async function confirmReservation(form) {
  if (submitting) return;
  if (!storeStatus.is_open) return notify('A lojinha está fechada.');
  const customer = form.elements.customer.value.trim();
  const sector = form.elements.sector.value.trim();
  const note = form.elements.note.value.trim();
  if (!customer) return notify('Informe seu nome para reservar.');
  if (!cart.length) return notify('Seu carrinho está vazio.');

  const items = cart.map(i => i.kind === 'buildable_box'
    ? { product_id: i.productId, quantity: i.qty, flavor_selection: i.flavors }
    : { product_id: i.productId, quantity: i.qty });

  let idempotencyKey = sessionStorage.getItem('dm_pending_idem');
  if (!idempotencyKey) {
    idempotencyKey = crypto.randomUUID();
    sessionStorage.setItem('dm_pending_idem', idempotencyKey);
  }

  submitting = true;
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Enviando...'; }

  const { data, error } = await supabase.rpc('dm_create_reservation', {
    p_tenant_slug: TENANT_SLUG,
    p_customer_name: customer,
    p_customer_sector: sector || null,
    p_note: note || null,
    p_items: items,
    p_idempotency_key: idempotencyKey,
  });
  submitting = false;

  if (error) {
    const map = {
      store_closed: 'A lojinha fechou enquanto você finalizava. Tente novamente mais tarde.',
      store_not_published: 'A lojinha ainda não está publicada.',
      insufficient_stock: 'O estoque mudou. Revise seu carrinho.',
      empty_cart: 'Seu carrinho está vazio.',
      customer_name_required: 'Informe seu nome para reservar.',
      invalid_box_composition: 'Selecione todos os sabores da caixinha.',
      invalid_flavor_selection: 'Um dos sabores escolhidos não é válido. Atualize a página e tente novamente.',
    };
    const code = (error.message || '').match(/[a-z_]+/)?.[0];
    notify(map[code] || 'Não foi possível registrar sua reserva. Tente novamente.');
    await loadData();
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Confirmar reserva'; }
    return;
  }

  const result = Array.isArray(data) ? data[0] : data;
  lastReservation = result;
  const cartSnapshot = cart.map(i => ({ ...i }));
  sessionStorage.removeItem('dm_pending_idem');
  cart = [];
  persistCart();
  await loadData();

  const receiptLines = [
    'NK DOCES · RESERVA',
    'Pedido #' + result.order_code,
    'Nome: ' + customer,
    sector ? 'Referência: ' + sector : null,
    'Total: ' + money(result.total_cents / 100),
    'Retirada: ' + storeStatus.pickup_instructions,
    'Pagamento: Pix · aguardando confirmação',
    note ? 'Observação: ' + note : null,
  ].filter(Boolean).join('\n');

  lastWhatsAppMessage = buildWhatsAppMessage(result, customer, cartSnapshot, note);
  const waLink = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(lastWhatsAppMessage);

  openModal(sheetTitle('Reserva registrada ♡') + `<div class="confirm-head"><div class="confirm-icon">🎀</div><h2>Seu docinho está reservado!</h2><p>Pedido <b>#${esc(result.order_code)}</b> registrado. Mostre esta tela para a Mitsuki na retirada.</p></div><div class="receipt">${esc(receiptLines)}</div>${storeStatus.pix_key ? `<div class="pick-box"><strong style="font-size:12px">Chave Pix</strong><p style="overflow-wrap:anywhere;font-size:12px;color:#795969;margin:9px 0">${esc(storeStatus.pix_key)}</p></div>` : '<div class="notice">A chave Pix ainda não foi cadastrada. O pagamento será combinado diretamente com a Mitsuki.</div>'}<div class="confirm-actions"><a class="button full whatsapp" href="${esc(waLink)}" target="_blank" rel="noopener noreferrer" id="wa-send-btn">📲 Enviar pedido pelo WhatsApp</a><button class="button full ghost" type="button" id="copy-whatsapp-msg">📋 Copiar mensagem</button></div><p class="confirm-help">Seu pedido já foi registrado! Toque no botão acima para abrir o WhatsApp da Mitsuki com a mensagem pronta — você ainda precisa tocar em "Enviar" dentro do próprio WhatsApp. Se ele não abrir automaticamente, use "Copiar mensagem" e cole na conversa.</p><button class="button ghost full" data-close>Voltar para a lojinha</button>`);
}

function buildWhatsAppMessage(result, customer, cartSnapshot, note) {
  const lines = ['🍬 *NK DOCES — NOVO PEDIDO*', '', '*Pedido:* #' + result.order_code, '*Cliente:* ' + customer, '', '*ITENS*'];
  for (const i of cartSnapshot) {
    if (i.kind === 'buildable_box') {
      const counts = new Map();
      for (const fid of i.flavors) {
        const name = products.find(p => p.id === fid)?.name || 'Sabor';
        counts.set(name, (counts.get(name) || 0) + 1);
      }
      const flavorText = [...counts.entries()].map(([name, n]) => n + 'x ' + name).join(', ');
      lines.push('- ' + i.qty + 'x ' + i.boxName);
      lines.push('  Sabores: ' + flavorText);
      lines.push('  Subtotal: ' + money(i.qty * i.price));
    } else {
      lines.push('- ' + i.qty + 'x ' + i.name);
      lines.push('  Subtotal: ' + money(i.qty * i.price));
    }
    lines.push('');
  }
  lines.push('*TOTAL:* ' + money(result.total_cents / 100));
  lines.push('');
  lines.push('*Retirada:* ' + storeStatus.pickup_instructions);
  lines.push('*Pagamento:* aguardando confirmação');
  if (note) { lines.push(''); lines.push('*Observação:* ' + note); }
  return lines.join('\n');
}

function changeCart(key, delta) {
  const i = cart.find(it => idOf(it) === key);
  if (!i) return;
  i.qty += delta;
  if (i.qty <= 0) cart.splice(cart.indexOf(i), 1);
  persistCart(); render();
  if (cart.length) showCart(); else closeModal();
}

document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.filter) { filter = b.dataset.filter; return render(); }
  if (b.id === 'cart-head' || b.id === 'basket-open') return showCart();
  if (b.dataset.addReady) return addReady(b.dataset.addReady);
  if (b.dataset.addSingle) return addSingle(b.dataset.addSingle);
  if (b.dataset.build) { builder = []; activeSlot = 0; return showBuilder(b.dataset.build); }
  if (b.dataset.close !== undefined) return closeModal();
  if (b.dataset.slot !== undefined) { activeSlot = Number(b.dataset.slot); return showBuilder(builderBoxProduct.id); }
  if (b.dataset.flavor) {
    builder[activeSlot] = b.dataset.flavor;
    const nextOpen = builder.findIndex(v => !v);
    if (nextOpen >= 0) activeSlot = nextOpen;
    return showBuilder(builderBoxProduct.id);
  }
  if (b.id === 'builder-add') {
    if (!builder.every(Boolean)) return notify('Selecione todos os sabores.');
    const key = idOf({ kind: 'buildable_box', productId: builderBoxProduct.id, flavors: builder });
    const found = cart.find(i => idOf(i) === key);
    if (found) found.qty++;
    else cart.push({ kind: 'buildable_box', productId: builderBoxProduct.id, boxName: builderBoxProduct.name, price: builderBoxProduct.price, flavors: [...builder], qty: 1 });
    persistCart(); render(); closeModal(); notify('Caixinha adicionada ao carrinho ♡');
    return;
  }
  if (b.dataset.cartDown !== undefined) return changeCart(b.dataset.cartDown, -1);
  if (b.dataset.cartUp !== undefined) return changeCart(b.dataset.cartUp, 1);
  if (b.id === 'go-checkout') return checkout();
  if (b.id === 'copy-whatsapp-msg') {
    if (!lastWhatsAppMessage) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(lastWhatsAppMessage)
        .then(() => notify('Mensagem copiada! Cole na conversa do WhatsApp.'))
        .catch(() => notify('Não foi possível copiar. Selecione o texto manualmente.'));
    } else {
      notify('Não foi possível copiar automaticamente. Selecione o texto manualmente.');
    }
    return;
  }
});

document.addEventListener('submit', e => {
  if (e.target.id === 'checkout-form') { e.preventDefault(); return confirmReservation(e.target); }
});

$('overlay').addEventListener('click', e => { if (e.target === $('overlay')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('overlay').classList.contains('hidden')) closeModal(); });

loadData();
