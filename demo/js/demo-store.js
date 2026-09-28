// Prévia de demonstração da vitrine — cópia adaptada de ../../js/store.js.
// Diferença central: ZERO import do Supabase (nem supabase-client.js, nem
// config.js). Os dados vêm só de ./demo-data.js (instantâneo estático do
// catálogo). "Confirmar reserva" nunca chama uma RPC — gera um código
// simulado localmente e mostra a confirmação, deixando claro que é
// demonstração. Não há decremento de estoque real (o "esgotado" aqui é só
// visual, reiniciando ao recarregar a página) e nada é persistido além do
// carrinho no sessionStorage do próprio navegador, por conveniência de UX.
import { DEMO_PRODUCTS, DEMO_STORE_STATUS } from './demo-data.js';

const $ = id => document.getElementById(id);
const money = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const SWEET_STYLE = {
  'brigadeiro-tradicional': { emoji: '🍫', color: '#855039' },
  'beijinho': { emoji: '🥥', color: '#f1d4a2' },
  'docinho-de-leite-ninho': { emoji: '🥛', color: '#f5d69c' },
};

// Estoque simulado em memória (nunca sincronizado com o Supabase), só pra
// a demonstração de "esgotado" fazer sentido dentro da própria sessão.
const DEMO_STOCK = { 'p-ready': 8, 'p-brig': 12, 'p-beij': 9, 'p-ninho': 7 };

let storeStatus = DEMO_STORE_STATUS;
let products = DEMO_PRODUCTS.map(p => ({ ...p }));
let cart = [];
let filter = 'all';
let builder = [];
let builderSlots = 4;
let builderBoxProduct = null;
let activeSlot = 0;
let demoSeq = 1;
let toastHandle;

const CART_KEY = 'doces_mitsuki_demo_cart_v1';
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

function reservedInCart(productId) {
  let n = 0;
  for (const i of cart) {
    if ((i.kind === 'ready_box' || i.kind === 'flavor') && i.productId === productId) n += i.qty;
    if (i.kind === 'buildable_box') n += i.flavors.filter(f => f === productId).length * i.qty;
  }
  return n;
}
function isAvailable(productId) {
  const stock = DEMO_STOCK[productId];
  if (stock === undefined) return true; // buildable_box não tem estoque próprio
  return stock - reservedInCart(productId) > 0;
}

function flavorList() { return products.filter(p => p.kind === 'flavor'); }
function canBuildBox() { return flavorList().some(f => isAvailable(f.id)); }

function render() {
  const count = cartCount();
  $('cart-dot').textContent = count;
  $('cart-dot').classList.toggle('hidden', !count);
  $('basket-bar').classList.toggle('hidden', !count);
  $('basket-count').textContent = count + ' ' + (count === 1 ? 'item no seu carrinho (demo)' : 'itens no seu carrinho (demo)');
  $('basket-total').textContent = money(cartTotal());

  const open = !!storeStatus.is_open;
  $('store-status').classList.toggle('closed', !open);
  $('store-status').innerHTML = open
    ? '<div><strong><span class="green-dot"></span>Hoje tem docinhos! 🍬</strong><p>Prévia de demonstração — escolha à vontade, nada é reservado de verdade.</p></div><span class="badge">● Aberto (demo)</span>'
    : '<div><strong><span class="green-dot"></span>Sem pronta entrega agora</strong><p>Prévia de demonstração.</p></div><span class="badge">Fechado</span>';
  $('pickup-wrap').classList.remove('hidden');
  $('pickup-display').innerHTML = '📍 Retirada: <b>' + esc(storeStatus.pickup_instructions) + '</b>';

  const p = [];
  if (filter !== 'single') {
    for (const box of products.filter(x => x.kind === 'ready_box')) {
      const left = isAvailable(box.id);
      p.push(`<article class="product"><div class="product-img"><img src="${box.image || ''}" alt="Imagem ilustrativa de caixinha com quatro docinhos"><span class="photo-overlay"></span><span class="product-ribbon">Caixinha pronta</span></div><div class="product-main"><h3>${esc(box.name)}</h3><p class="product-desc">Escolha rápida, já montada para você.</p><div class="stock ${!left ? 'out' : ''}">${!left ? 'Esgotado' : ''}</div><div class="product-foot"><span class="price">${money(box.price)}</span><button class="addbtn" data-add-ready="${esc(box.id)}" aria-label="Adicionar ${esc(box.name)}" ${!open || !left ? 'disabled' : ''}>+</button></div></div></article>`);
    }
    for (const box of products.filter(x => x.kind === 'buildable_box')) {
      const canBuild = canBuildBox();
      p.push(`<article class="product"><div class="product-img"><img src="${box.image || ''}" alt="Imagem ilustrativa de caixinha montada com quatro docinhos variados"><span class="photo-overlay"></span><span class="product-ribbon">Do seu jeito ♡</span></div><div class="product-main"><h3>${esc(box.name)}</h3><p class="product-desc">Escolha quatro sabores, iguais ou diferentes.</p><div class="stock ${!canBuild ? 'out' : ''}">${!canBuild ? 'Esgotado' : ''}</div><div class="product-foot"><span class="price">${money(box.price)}</span><button class="addbtn build" data-build="${esc(box.id)}" ${!open || !canBuild ? 'disabled' : ''}>Montar</button></div></div></article>`);
    }
  }
  if (filter !== 'boxes') {
    for (const s of flavorList()) {
      const left = isAvailable(s.id);
      const style = SWEET_STYLE[s.slug] || { emoji: '🍬', color: '#9d5f45' };
      p.push(`<article class="product"><div class="product-img tint"><div class="sweet-art" style="--sweet:${esc(style.color)}">${esc(style.emoji)}</div><img class="sweet-photo" loading="lazy" decoding="async" src="${s.image || ''}" alt="Imagem ilustrativa de ${esc(s.name)}" onerror="this.remove()"><span class="photo-overlay"></span><span class="product-ribbon">Avulso</span></div><div class="product-main"><h3>${esc(s.name)}</h3><p class="product-desc">Uma unidade para adoçar sua pausa.</p><div class="stock ${!left ? 'out' : ''}">${!left ? 'Esgotado' : ''}</div><div class="product-foot"><span class="price">${money(s.price)}</span><button class="addbtn" data-add-single="${esc(s.id)}" aria-label="Adicionar ${esc(s.name)}" ${!open || !left ? 'disabled' : ''}>+</button></div></div></article>`);
    }
  }
  $('products').innerHTML = p.join('') || '<div class="blank" style="grid-column:1/-1">Nenhum produto nesta categoria.</div>';
  document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('selected', b.dataset.filter === filter));
}

function addReady(productId) {
  const box = products.find(p => p.id === productId);
  if (!box) return;
  if (!isAvailable(productId)) return notify('Esgotado nesta demonstração.');
  const key = idOf({ kind: 'ready_box', productId });
  const found = cart.find(i => idOf(i) === key);
  const nextQty = (found?.qty || 0) + 1;
  if (nextQty > (DEMO_STOCK[productId] ?? Infinity)) return notify('Estoque de demonstração esgotado.');
  if (found) found.qty++;
  else cart.push({ kind: 'ready_box', productId, name: box.name, price: box.price, qty: 1 });
  persistCart(); render(); notify('Adicionado ao carrinho (demo) ♡');
}
function addSingle(productId) {
  const flavor = products.find(p => p.id === productId);
  if (!flavor) return;
  if (!isAvailable(productId)) return notify('Esgotado nesta demonstração.');
  const key = idOf({ kind: 'flavor', productId });
  const found = cart.find(i => idOf(i) === key);
  if (found) found.qty++;
  else cart.push({ kind: 'flavor', productId, name: flavor.name, price: flavor.price, qty: 1 });
  persistCart(); render(); notify('Adicionado ao carrinho (demo) ♡');
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

function availableForSlot(flavorId) {
  const pickedElsewhere = builder.reduce((n, chosen, i) => n + (i !== activeSlot && chosen === flavorId ? 1 : 0), 0);
  const stock = DEMO_STOCK[flavorId] ?? Infinity;
  return stock - reservedInCart(flavorId) - pickedElsewhere > 0;
}

function showBuilder(boxProductId) {
  const box = products.find(p => p.id === boxProductId);
  if (!box) return;
  builderBoxProduct = box;
  builderSlots = box.boxSlotCount || 4;
  if (builder.length !== builderSlots) builder = new Array(builderSlots).fill(null);
  const flavors = flavorList();
  const slots = builder.map((chosen, n) => `<button data-slot="${n}" class="slot ${activeSlot === n ? 'active' : ''}" aria-pressed="${activeSlot === n}">${n + 1}º doce: ${chosen ? esc(products.find(p => p.id === chosen)?.name || 'Escolher') : 'Escolher ♡'}</button>`).join('');
  const flavorButtons = flavors.map(s => `<button data-flavor="${esc(s.id)}" class="flavor" ${!availableForSlot(s.id) ? 'disabled' : ''}><span class="flavor-pic"><span>${esc((SWEET_STYLE[s.slug] || {}).emoji || '🍬')}</span><img loading="lazy" decoding="async" src="${s.image || ''}" alt="" onerror="this.remove()"></span>${esc(s.name)}<small>${!availableForSlot(s.id) ? 'Esgotado' : 'Escolher sabor'}</small></button>`).join('');
  openModal(sheetTitle('Sua caixinha, do seu jeito ♡ (demo)') +
    `<p class="extra">Escolha ${builderSlots} docinhos. Pode repetir seu favorito, conforme disponibilidade.</p><div class="pick-box"><div class="slot-label">Escolha seus ${builderSlots} sabores</div><div class="slots">${slots}</div></div><div class="slot-label">Sabores do dia</div><div class="flavor-grid">${flavorButtons}</div><div class="sumline"><span>Sua caixinha (${builderSlots} un.)</span><strong>${money(box.price)}</strong></div><button class="button full" id="builder-add" ${builder.every(Boolean) ? '' : 'disabled'}>Adicionar caixinha ao carrinho</button>`);
}

function showCart() {
  if (!cart.length) return notify('Seu carrinho está vazio.');
  openModal(sheetTitle('Seu carrinho 🛍️ (demo)') + `<p class="extra">Revise seus docinhos — isto é uma demonstração, nada será reservado de verdade.</p>${cart.map(i => `<div class="cart-item"><div><strong>${esc(lineName(i))}</strong><small>${money(unitPrice(i) * i.qty)}</small></div><div class="stepper"><button data-cart-down="${esc(idOf(i))}" aria-label="Diminuir quantidade">−</button><b>${i.qty}</b><button data-cart-up="${esc(idOf(i))}" aria-label="Aumentar quantidade">+</button></div></div>`).join('')}<div class="sumline"><span>Total do pedido</span><strong>${money(cartTotal())}</strong></div><div class="notice">🧪 Demonstração: esta reserva não será enviada à Mitsuki, nem cobrará Pix, nem baixa estoque real.</div><button class="button full" id="go-checkout" ${!storeStatus.is_open ? 'disabled' : ''}>Continuar (demo) →</button>`);
}

function checkout() {
  if (!cart.length) return closeModal();
  openModal(sheetTitle('Finalizar reserva (demo) ♡') + `<p class="extra">Formulário de demonstração — os dados preenchidos aqui não são enviados a lugar nenhum.</p><form id="checkout-form"><label class="field">Seu nome *<input name="customer" required maxlength="60" placeholder="Ex.: Glebert" autocomplete="name"></label><label class="field">Referência para retirada (opcional)<input name="sector" maxlength="60" placeholder="Ex.: Administrativo"></label><label class="field">Observação (opcional)<textarea name="note" maxlength="160" placeholder="Ex.: vou buscar no intervalo"></textarea></label><div class="pick-box"><strong style="font-size:12px">📍 Retirada com a Mitsuki</strong><p class="extra" style="margin:6px 0 0">${esc(storeStatus.pickup_instructions)}</p></div><div class="pick-box"><strong style="font-size:12px">💠 Pagamento: Pix</strong><p class="extra" style="margin:6px 0 0">Demonstração — nenhum pagamento é processado.</p></div><div class="sumline"><span>Total</span><strong>${money(cartTotal())}</strong></div><div class="notice">🧪 DEMONSTRAÇÃO — nenhum pedido será registrado. Nada aqui chega ao banco de dados real da loja.</div><button class="button full" type="submit">Simular confirmação</button></form>`);
}

function confirmReservationDemo(form) {
  const customer = form.elements.customer.value.trim();
  const sector = form.elements.sector.value.trim();
  const note = form.elements.note.value.trim();
  if (!customer) return notify('Informe seu nome para simular a reserva.');
  if (!cart.length) return notify('Seu carrinho está vazio.');

  // Só efeito local, sem persistência: decrementa o estoque simulado em
  // memória (perdido ao recarregar) para o "esgotado" fazer sentido na demo.
  for (const i of cart) {
    if (i.kind === 'ready_box' || i.kind === 'flavor') {
      if (DEMO_STOCK[i.productId] !== undefined) DEMO_STOCK[i.productId] -= i.qty;
    } else if (i.kind === 'buildable_box') {
      for (const f of i.flavors) if (DEMO_STOCK[f] !== undefined) DEMO_STOCK[f] -= i.qty;
    }
  }

  const orderCode = 'DEMO-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + String(demoSeq++).padStart(3, '0');
  const total = cartTotal();
  cart = [];
  persistCart();
  render();

  const receiptLines = [
    'NK DOCES · SIMULAÇÃO DE RESERVA',
    'Pedido #' + orderCode + ' (demonstração, não é um pedido real)',
    'Nome: ' + customer,
    sector ? 'Referência: ' + sector : null,
    'Total: ' + money(total),
    'Retirada: ' + storeStatus.pickup_instructions,
    note ? 'Observação: ' + note : null,
    '',
    'Este pedido NÃO foi enviado à Mitsuki nem gravado em nenhum banco de dados.',
  ].filter(Boolean).join('\n');

  openModal(sheetTitle('Simulação registrada ♡') + `<div class="confirm-head"><div class="confirm-icon">🧪</div><h2>Demonstração concluída!</h2><p>Código de exemplo <b>#${esc(orderCode)}</b>. Isto é uma simulação — nenhum pedido real foi criado.</p></div><div class="receipt">${esc(receiptLines)}</div><div class="notice">DEMONSTRAÇÃO — nenhum pedido foi registrado. Nada foi salvo no banco de dados da NK Doces.</div><div class="confirm-actions"><button class="button full whatsapp" type="button" disabled>📲 Enviar pedido pelo WhatsApp</button></div><p class="confirm-help">O envio real pelo WhatsApp só está disponível na lojinha publicada, depois que uma reserva de verdade é registrada — esta é apenas uma demonstração e não abre o WhatsApp da Mitsuki.</p><button class="button ghost full" data-close>Voltar para a prévia</button>`);
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
    if (!availableForSlot(b.dataset.flavor)) return notify('Esgotado nesta demonstração.');
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
    persistCart(); render(); closeModal(); notify('Caixinha adicionada ao carrinho (demo) ♡');
    return;
  }
  if (b.dataset.cartDown !== undefined) return changeCart(b.dataset.cartDown, -1);
  if (b.dataset.cartUp !== undefined) return changeCart(b.dataset.cartUp, 1);
  if (b.id === 'go-checkout') return checkout();
});

document.addEventListener('submit', e => {
  if (e.target.id === 'checkout-form') { e.preventDefault(); return confirmReservationDemo(e.target); }
});

$('overlay').addEventListener('click', e => { if (e.target === $('overlay')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('overlay').classList.contains('hidden')) closeModal(); });

render();
