// Prévia isolada da vitrine — instantâneo do catálogo real em 2026-09-28,
// lido do Supabase só para leitura (nenhuma escrita), copiado aqui como
// dado estático. Esta página NÃO se conecta ao Supabase: não há
// js/config.js nem js/supabase-client.js importados em demo/index.html.
// Se o catálogo mudar no painel real, atualize este arquivo manualmente
// para a prévia refletir a mudança — é o preço de manter a prévia 100%
// isolada e incapaz de gravar nada.
export const DEMO_PRODUCTS = [
  {
    id: 'p-custom', name: 'Monte sua caixinha · 4 docinhos', slug: 'monte-sua-caixinha-4-docinhos',
    description: 'Escolha quatro sabores, iguais ou diferentes. [DEMO] preço a confirmar com a Mitsuki.',
    price: 18.00, kind: 'buildable_box', boxSlotCount: 4, isAvailable: true, image: '../assets/img/custom.webp',
  },
  {
    id: 'p-brig', name: 'Brigadeiro tradicional', slug: 'brigadeiro-tradicional',
    description: 'Uma unidade para adoçar sua pausa. [DEMO] sabor e preço a confirmar.',
    price: 4.50, kind: 'flavor', boxSlotCount: null, isAvailable: true, image: '../assets/img/brig.webp',
    emoji: '🍫', color: '#855039',
  },
  {
    id: 'p-beij', name: 'Beijinho', slug: 'beijinho',
    description: 'Uma unidade para adoçar sua pausa. [DEMO] sabor e preço a confirmar.',
    price: 4.50, kind: 'flavor', boxSlotCount: null, isAvailable: true, image: '../assets/img/beij.webp',
    emoji: '🥥', color: '#f1d4a2',
  },
  {
    id: 'p-ninho', name: 'Docinho de leite Ninho', slug: 'docinho-de-leite-ninho',
    description: 'Uma unidade para adoçar sua pausa. [DEMO] sabor e preço a confirmar.',
    price: 4.50, kind: 'flavor', boxSlotCount: null, isAvailable: true, image: '../assets/img/ninho.webp',
    emoji: '🥛', color: '#f5d69c',
  },
];

export const DEMO_STORE_STATUS = {
  pickup_instructions: 'Retirada diretamente com a Mitsuki, na Brago.',
  pix_key: null,
};
