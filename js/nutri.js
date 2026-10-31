/* nutri.js — plano alimentar: leitura, troca de opções e lista de compras.
 *
 * O plano em si NÃO está no código (o repositório é público): importa-se de
 * um ficheiro JSON e fica só no telemóvel (store 'nutri'). Aqui ficam apenas:
 *   · FOODS — tabela genérica de calorias e proteína por 100 g/ml (valores de
 *     referência das tabelas TACO/USDA, arredondados), categoria e nome para a
 *     lista de compras, e o factor cozinhado → cru para comprar a quantidade certa;
 *   · um plano de EXEMPLO fictício, para experimentar a página;
 *   · a interface.
 *
 * Formato do plano (JSON):
 *   { format: 'sportstrack-nutri', version: 1, name, author, date,
 *     targets: { waterL, fruit },
 *     guidelines: [{ title, items: [..] }],
 *     meals: [{ id, time, name,
 *               items: [{ id, options: [{ food, qty, g, free }] }],   // options[0] = base
 *               notes: [..], ideas: [..], recipes: [{ title, ingredients: [..], steps }] }],
 *     recipes: [{ title, yield, ingredients: [..], steps: [..] }] }
 *
 * Carregado antes do app.js; usa os globais dele só quando é chamado. */

/* kcal e proteína (g) por 100 g ou 100 ml.
 * cat: secção da lista de compras · shop: nome na lista · buy: factor
 * cozinhado → cru (ex.: 150 g de arroz cozido ≈ 60 g cru) · unitG: peso de uma
 * unidade, para dizer "≈ 6 un" · free: "à vontade" (kcal fixas por porção). */
const FOODS = {
  // Padaria e cereais
  'Pão integral ou de forma': { kcal: 250, p: 12, cat: 'Padaria e cereais', shop: 'Pão de forma integral', unitG: 25, unit: 'fatias' },
  'Pão de forma integral': { kcal: 250, p: 12, cat: 'Padaria e cereais', shop: 'Pão de forma integral', unitG: 25, unit: 'fatias' },
  'Pão francês': { kcal: 300, p: 8, cat: 'Padaria e cereais', shop: 'Pão francês', unitG: 50, unit: 'un' },
  'Pão sírio mini': { kcal: 275, p: 9, cat: 'Padaria e cereais', shop: 'Pão sírio mini', unitG: 25, unit: 'un' },
  'Goma de tapioca': { kcal: 240, p: 0, cat: 'Padaria e cereais', shop: 'Goma de tapioca' },
  'Aveia em flocos': { kcal: 394, p: 13.9, cat: 'Padaria e cereais', shop: 'Aveia em flocos' },
  'Farelo de aveia': { kcal: 246, p: 17, cat: 'Padaria e cereais', shop: 'Farelo de aveia' },
  'Arroz branco cozido': { kcal: 128, p: 2.5, cat: 'Padaria e cereais', shop: 'Arroz branco (cru)', buy: 0.4 },
  'Arroz integral': { kcal: 124, p: 2.6, cat: 'Padaria e cereais', shop: 'Arroz integral (cru)', buy: 0.4 },
  'Macarrão alho e óleo': { kcal: 150, p: 4.5, cat: 'Padaria e cereais', shop: 'Massa (crua)', buy: 0.45 },
  'Quinoa com legumes': { kcal: 120, p: 4, cat: 'Padaria e cereais', shop: 'Quinoa (crua)', buy: 0.25 },

  // Proteínas
  'Filé de frango grelhado': { kcal: 159, p: 32, cat: 'Talho e peixaria', shop: 'Peito de frango (cru)', buy: 1.35 },
  'Peito de frango assado ou cozido': { kcal: 163, p: 31, cat: 'Talho e peixaria', shop: 'Peito de frango (cru)', buy: 1.35 },
  'Frango desfiado': { kcal: 163, p: 31, cat: 'Talho e peixaria', shop: 'Peito de frango (cru)', buy: 1.35 },
  'Tilápia grelhada ou cozida': { kcal: 128, p: 26, cat: 'Talho e peixaria', shop: 'Filé de tilápia (cru)', buy: 1.25 },
  'Salmão cozido': { kcal: 206, p: 22, cat: 'Talho e peixaria', shop: 'Salmão (cru)', buy: 1.2 },
  'Bife grelhado ou assado': { kcal: 230, p: 30, cat: 'Talho e peixaria', shop: 'Carne de vaca para bife (crua)', buy: 1.4 },
  'Carne refogada ou ensopada': { kcal: 210, p: 28, cat: 'Talho e peixaria', shop: 'Carne de vaca para estufar (crua)', buy: 1.4 },
  'Carne moída refogada': { kcal: 212, p: 26, cat: 'Talho e peixaria', shop: 'Carne picada (crua)', buy: 1.35 },
  'Pernil': { kcal: 262, p: 30, cat: 'Talho e peixaria', shop: 'Pernil de porco (cru)', buy: 1.4 },
  'Atum em conserva em óleo': { kcal: 166, p: 26, cat: 'Mercearia', shop: 'Atum em lata (escorrido)' },

  // Laticínios e ovos
  'Ovo de galinha cozido': { kcal: 146, p: 13.3, cat: 'Laticínios e ovos', shop: 'Ovos', unitG: 50, unit: 'un' },
  'Ovo mexido': { kcal: 160, p: 11.5, cat: 'Laticínios e ovos', shop: 'Ovos', unitG: 50, unit: 'un' },
  'Omelete com vegetais': { kcal: 155, p: 10, cat: 'Laticínios e ovos', shop: 'Ovos', unitG: 50, unit: 'un', buy: 0.77 },
  'Queijo minas': { kcal: 264, p: 17.4, cat: 'Laticínios e ovos', shop: 'Queijo minas (fresco)' },
  'Queijo muçarela': { kcal: 330, p: 22.6, cat: 'Laticínios e ovos', shop: 'Queijo muçarela' },
  'Queijo cottage': { kcal: 72, p: 12, cat: 'Laticínios e ovos', shop: 'Queijo cottage' },
  'Creme de ricota': { kcal: 200, p: 9, cat: 'Laticínios e ovos', shop: 'Creme de ricota' },
  'Iogurte natural': { kcal: 51, p: 4.1, cat: 'Laticínios e ovos', shop: 'Iogurte natural', unitG: 170, unit: 'un' },
  'Iogurte grego': { kcal: 120, p: 5, cat: 'Laticínios e ovos', shop: 'Iogurte grego', unitG: 100, unit: 'un' },
  'Leite semidesnatado': { kcal: 46, p: 3.2, cat: 'Laticínios e ovos', shop: 'Leite meio-gordo' },

  // Frutas
  'Banana': { kcal: 92, p: 1.4, cat: 'Fruta', shop: 'Banana', unitG: 100, unit: 'un' },
  'Mamão papaia': { kcal: 40, p: 0.5, cat: 'Fruta', shop: 'Papaia', unitG: 310, unit: 'un' },
  'Pera': { kcal: 53, p: 0.6, cat: 'Fruta', shop: 'Pera', unitG: 110, unit: 'un' },
  'Goiaba vermelha': { kcal: 54, p: 1.1, cat: 'Fruta', shop: 'Goiaba', unitG: 130, unit: 'un' },
  'Manga': { kcal: 64, p: 0.4, cat: 'Fruta', shop: 'Manga' },
  'Maçã': { kcal: 56, p: 0.3, cat: 'Fruta', shop: 'Maçã', unitG: 130, unit: 'un' },
  'Morango': { kcal: 30, p: 0.9, cat: 'Fruta', shop: 'Morango' },
  'Kiwi': { kcal: 51, p: 1.3, cat: 'Fruta', shop: 'Kiwi', unitG: 75, unit: 'un' },
  'Amora': { kcal: 43, p: 1.4, cat: 'Fruta', shop: 'Amora' },
  'Abacaxi': { kcal: 48, p: 0.9, cat: 'Fruta', shop: 'Ananás (abacaxi)' },
  'Tangerina': { kcal: 38, p: 0.8, cat: 'Fruta', shop: 'Tangerina', unitG: 135, unit: 'un' },
  'Laranja': { kcal: 37, p: 1, cat: 'Fruta', shop: 'Laranja', unitG: 180, unit: 'un' },

  // Legumes e folhas (com quantidade)
  'Legumes refogados': { kcal: 50, p: 1.5, cat: 'Legumes e folhas', shop: 'Legumes variados' },
  'Sopa de legumes': { kcal: 35, p: 1.5, cat: 'Legumes e folhas', shop: 'Legumes para sopa' },
  'Brócolis': { kcal: 25, p: 2.1, cat: 'Legumes e folhas', shop: 'Brócolos' },
  'Couve-flor': { kcal: 23, p: 1.9, cat: 'Legumes e folhas', shop: 'Couve-flor' },
  'Cenoura cozida': { kcal: 30, p: 0.8, cat: 'Legumes e folhas', shop: 'Cenoura' },
  'Tomate cereja': { kcal: 21, p: 0.9, cat: 'Legumes e folhas', shop: 'Tomate cereja' },
  'Batata assada': { kcal: 93, p: 2.5, cat: 'Legumes e folhas', shop: 'Batata', buy: 1.1 },
  'Purê de batata': { kcal: 110, p: 2, cat: 'Legumes e folhas', shop: 'Batata', buy: 1 },
  'Abóbora assada': { kcal: 48, p: 1, cat: 'Legumes e folhas', shop: 'Abóbora', buy: 1.2 },

  // À vontade (sem quantidade): kcal fixas por porção típica
  'Alface': { free: 8, cat: 'Legumes e folhas', shop: 'Alface' },
  'Almeirão': { free: 8, cat: 'Legumes e folhas', shop: 'Almeirão (chicória)' },
  'Repolho roxo': { free: 10, cat: 'Legumes e folhas', shop: 'Couve roxa' },
  'Agrião': { free: 6, cat: 'Legumes e folhas', shop: 'Agrião' },
  'Couve cozida': { free: 15, cat: 'Legumes e folhas', shop: 'Couve' },
  'Rúcula': { free: 6, cat: 'Legumes e folhas', shop: 'Rúcula' },
  'Tomate': { free: 10, cat: 'Legumes e folhas', shop: 'Tomate' },
  'Cebola': { free: 10, cat: 'Legumes e folhas', shop: 'Cebola' },
  'Pepino': { free: 6, cat: 'Legumes e folhas', shop: 'Pepino' },
  'Rabanete': { free: 6, cat: 'Legumes e folhas', shop: 'Rabanete' },
  'Cenoura ralada': { free: 12, cat: 'Legumes e folhas', shop: 'Cenoura' },
  'Berinjela': { free: 15, cat: 'Legumes e folhas', shop: 'Beringela' },
  'Couve manteiga refogada': { free: 40, cat: 'Legumes e folhas', shop: 'Couve' },
  'Abobrinha': { free: 12, cat: 'Legumes e folhas', shop: 'Curgete' },

  // Mercearia e temperos
  'Azeite, sal e limão': { kcal: 814, p: 0, cat: 'Mercearia', shop: 'Azeite extravirgem' },
  'Semente de linhaça': { kcal: 495, p: 14.1, cat: 'Mercearia', shop: 'Sementes de linhaça' },
  'Semente de chia': { kcal: 486, p: 16.5, cat: 'Mercearia', shop: 'Sementes de chia' },
  'Canela em pó': { kcal: 247, p: 4, cat: 'Mercearia', shop: 'Canela em pó' },
  'Chocolate amargo 70%': { kcal: 550, p: 7, cat: 'Mercearia', shop: 'Chocolate 70%' },
  'Café': { kcal: 2, p: 0.1, cat: 'Mercearia', shop: 'Café moído', buy: 0.05 }
};

const SHOP_ORDER = ['Fruta', 'Legumes e folhas', 'Talho e peixaria', 'Laticínios e ovos', 'Padaria e cereais', 'Mercearia', 'Outros'];

/* ---------- Plano de exemplo (fictício) ---------- */

const DEMO_NUTRI_PLAN = {
  format: 'sportstrack-nutri', version: 1,
  name: 'Plano de exemplo', author: 'Exemplo fictício', date: null,
  targets: { waterL: 2.5, fruit: '3 porções' },
  guidelines: [
    { title: 'Exemplo', items: ['Este é um plano fictício só para experimentar a página.', 'Importa o teu plano em "Plano" → "Importar".'] }
  ],
  meals: [
    { id: 'm1', time: '08:00', name: 'Pequeno-almoço',
      items: [
        { id: 'a', options: [{ food: 'Pão integral ou de forma', qty: '2 fatias', g: 50 }, { food: 'Goma de tapioca', qty: '2 c. sopa', g: 30 }, { food: 'Pão francês', qty: '1 un', g: 50 }] },
        { id: 'b', options: [{ food: 'Ovo mexido', qty: '2 un', g: 100 }, { food: 'Queijo minas', qty: '2 fatias', g: 40 }] },
        { id: 'c', options: [{ food: 'Maçã', qty: '1 un', g: 130 }, { food: 'Pera', qty: '1 un', g: 110 }, { food: 'Banana', qty: '1 un', g: 100 }] }
      ],
      notes: ['Exemplo: escolhe um pão, uma proteína e uma fruta.'], ideas: [], recipes: [] },
    { id: 'm2', time: '10:30', name: 'Lanche',
      items: [
        { id: 'a', options: [{ food: 'Iogurte natural', qty: '1 un', g: 170 }, { food: 'Iogurte grego', qty: '1 un', g: 100 }] },
        { id: 'b', options: [{ food: 'Kiwi', qty: '2 un', g: 150 }, { food: 'Morango', qty: '1 chávena', g: 140 }] },
        { id: 'c', options: [{ food: 'Semente de chia', qty: '1 c. sopa', g: 15 }, { food: 'Aveia em flocos', qty: '1 c. sopa', g: 15 }] }
      ], notes: [], ideas: [], recipes: [] },
    { id: 'm3', time: '13:00', name: 'Almoço',
      items: [
        { id: 'a', options: [{ food: 'Rúcula', qty: 'À vontade', free: true }, { food: 'Alface', qty: 'À vontade', free: true }] },
        { id: 'b', options: [{ food: 'Azeite, sal e limão', qty: '1 c. sobremesa', g: 5 }] },
        { id: 'c', options: [{ food: 'Batata assada', qty: '180 g', g: 180 }, { food: 'Arroz integral', qty: '120 g', g: 120 }, { food: 'Abóbora assada', qty: '220 g', g: 220 }] },
        { id: 'd', options: [{ food: 'Tilápia grelhada ou cozida', qty: '140 g', g: 140 }, { food: 'Peito de frango assado ou cozido', qty: '130 g', g: 130 }, { food: 'Salmão cozido', qty: '110 g', g: 110 }] },
        { id: 'e', options: [{ food: 'Brócolis', qty: '1 chávena', g: 90 }, { food: 'Couve-flor', qty: '2 raminhos', g: 120 }] },
        { id: 'f', options: [{ food: 'Laranja', qty: '1 un', g: 180 }, { food: 'Abacaxi', qty: '2 fatias', g: 150 }] }
      ], notes: [], ideas: [], recipes: [] },
    { id: 'm4', time: '17:00', name: 'Lanche da tarde',
      items: [
        { id: 'a', options: [{ food: 'Pão francês', qty: '1 un', g: 50 }, { food: 'Pão de forma integral', qty: '2 fatias', g: 50 }] },
        { id: 'b', options: [{ food: 'Frango desfiado', qty: '3 c. sopa', g: 60 }, { food: 'Atum em conserva em óleo', qty: '3 c. sopa', g: 48 }] },
        { id: 'c', options: [{ food: 'Queijo cottage', qty: '1 fatia', g: 37 }, { food: 'Creme de ricota', qty: '1 c. sopa', g: 20 }] }
      ], notes: [], ideas: [], recipes: [] },
    { id: 'm5', time: '20:00', name: 'Jantar',
      items: [
        { id: 'a', options: [{ food: 'Sopa de legumes', qty: '2 conchas', g: 260 }] },
        { id: 'b', options: [{ food: 'Omelete com vegetais', qty: '130 g', g: 130 }, { food: 'Peito de frango assado ou cozido', qty: '120 g', g: 120 }] },
        { id: 'c', options: [{ food: 'Arroz branco cozido', qty: '80 g', g: 80 }, { food: 'Quinoa com legumes', qty: '80 g', g: 80 }] },
        { id: 'd', options: [{ food: 'Pera', qty: '1 un', g: 110 }, { food: 'Kiwi', qty: '2 un', g: 150 }] }
      ], notes: [], ideas: [], recipes: [] }
  ],
  recipes: [
    { title: 'Abóbora assada (exemplo)', yield: '2 porções', ingredients: ['250 g de abóbora', '1 c. sopa de azeite', 'Ervas a gosto'], steps: ['Cortar em cubos, regar com azeite e assar a 180 ºC até ficar macia.'] }
  ]
};

/* ---------- Estado ---------- */

let nutriPlan = null;        // plano importado (ou o exemplo)
let nutriChoices = {};       // 'mealId.itemId' -> índice da opção escolhida
let nutriShop = { days: 7, checked: {} };
let nutriView = 'plano';     // 'plano' | 'compras' | 'guias'
let nutriOpen = null;        // item com as opções abertas ('mealId.itemId')

async function loadNutri() {
  const [plan, sel, shop] = await Promise.all([
    DB.getNutri('plan'), DB.getNutri('selection'), DB.getNutri('shopping')
  ]);
  nutriPlan = plan ? plan.plan : null;
  nutriChoices = sel ? sel.choices || {} : {};
  nutriShop = shop ? { days: shop.days || 7, checked: shop.checked || {} } : { days: 7, checked: {} };
}

function saveChoices() {
  return DB.setNutri({ id: 'selection', choices: nutriChoices, updatedAt: new Date().toISOString() });
}

function saveShop() {
  return DB.setNutri({ id: 'shopping', days: nutriShop.days, checked: nutriShop.checked });
}

/* ---------- Contas ---------- */

function chosenOption(meal, item) {
  const i = nutriChoices[meal.id + '.' + item.id] || 0;
  return item.options[Math.min(i, item.options.length - 1)];
}

/* kcal e proteína de uma opção; null quando o alimento não está na tabela. */
function optionNutrition(opt) {
  const f = FOODS[opt.food];
  if (!f) return null;
  if (opt.free || f.free) return { kcal: f.free || 10, p: 0 };
  if (!(opt.g > 0)) return null;
  return { kcal: (f.kcal * opt.g) / 100, p: (f.p * opt.g) / 100 };
}

function mealTotals(meal) {
  let kcal = 0, p = 0, unknown = 0;
  meal.items.forEach((item) => {
    const n = optionNutrition(chosenOption(meal, item));
    if (n) { kcal += n.kcal; p += n.p; } else unknown++;
  });
  return { kcal: kcal, p: p, unknown: unknown };
}

function dayTotals() {
  return (nutriPlan ? nutriPlan.meals : []).reduce((acc, m) => {
    const t = mealTotals(m);
    return { kcal: acc.kcal + t.kcal, p: acc.p + t.p, unknown: acc.unknown + t.unknown };
  }, { kcal: 0, p: 0, unknown: 0 });
}

/* Total mínimo e máximo do dia com todas as combinações de opções. */
function dayRange() {
  let lo = 0, hi = 0;
  (nutriPlan ? nutriPlan.meals : []).forEach((m) => m.items.forEach((item) => {
    const ks = item.options.map(optionNutrition).filter(Boolean).map((n) => n.kcal);
    if (ks.length) { lo += Math.min.apply(null, ks); hi += Math.max.apply(null, ks); }
  }));
  return { lo: lo, hi: hi };
}

/* ---------- Página ---------- */

async function renderNutri() {
  await loadNutri();
  document.querySelectorAll('#nutri-tabs .seg').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.nview === nutriView);
  });
  document.querySelectorAll('[data-nutri-panel]').forEach((p) => {
    p.hidden = !nutriPlan || p.dataset.nutriPanel !== nutriView;
  });
  $('#nutri-tabs').hidden = !nutriPlan;
  $('#nutri-empty').hidden = !!nutriPlan;
  $('#nutri-plan-name').textContent = nutriPlan
    ? nutriPlan.name + (nutriPlan.author ? ' · ' + nutriPlan.author : '') + (nutriPlan.date ? ' · ' + prettyDate(nutriPlan.date) : '')
    : 'Sem plano carregado';
  $('#btn-nutri-export').disabled = !nutriPlan;
  $('#btn-nutri-clear').disabled = !nutriPlan;
  if (!nutriPlan) return;

  if (nutriView === 'plano') renderNutriPlan();
  else if (nutriView === 'compras') renderShopping();
  else renderGuides();
}

function renderNutriPlan() {
  const t = dayTotals();
  const range = dayRange();
  const tg = nutriPlan.targets || {};
  $('#nutri-summary').innerHTML =
    '<div class="ns-main"><span class="ns-label">Hoje, com as tuas escolhas</span>' +
      '<span class="ns-kcal">' + Math.round(t.kcal).toLocaleString('pt-PT') + '<small> kcal</small></span>' +
      '<span class="ns-sub">' + Math.round(t.p) + ' g de proteína · conforme as opções: ' +
        Math.round(range.lo).toLocaleString('pt-PT') + '–' + Math.round(range.hi).toLocaleString('pt-PT') + ' kcal' +
        (t.unknown ? ' · ' + t.unknown + ' alimento(s) sem valores' : '') + '</span></div>' +
    '<div class="ns-chips">' +
      (tg.waterL ? '<span class="ns-chip">💧 ' + dec(tg.waterL) + ' L de água</span>' : '') +
      (tg.fruit ? '<span class="ns-chip">🍎 ' + escapeHtml(tg.fruit) + ' de fruta</span>' : '') +
    '</div>' +
    '<button type="button" class="btn-secondary" id="btn-nutri-use">Usar ' + Math.round(t.kcal).toLocaleString('pt-PT') +
      ' kcal no plano de perda da app</button>';
  $('#btn-nutri-use').addEventListener('click', () => useNutriTotal(Math.round(t.kcal)));

  const host = $('#nutri-meals');
  host.innerHTML = '';
  nutriPlan.meals.forEach((meal) => host.appendChild(buildMealCard(meal)));
}

function buildMealCard(meal) {
  const mt = mealTotals(meal);
  const card = document.createElement('section');
  card.className = 'panel nf-meal';
  card.innerHTML =
    '<div class="nf-head"><span class="nf-time">' + escapeHtml(meal.time || '') + '</span>' +
    '<h2>' + escapeHtml(meal.name) + '</h2>' +
    '<span class="nf-total">' + Math.round(mt.kcal) + ' kcal</span></div>';

  meal.items.forEach((item) => {
    const key = meal.id + '.' + item.id;
    const opt = chosenOption(meal, item);
    const n = optionNutrition(opt);
    const multi = item.options.length > 1;
    const open = nutriOpen === key;

    const wrap = document.createElement('div');
    wrap.className = 'nf-item' + (open ? ' is-open' : '');
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'nf-row';
    row.disabled = !multi;
    row.innerHTML =
      '<span class="nf-name">' + escapeHtml(opt.food) + '</span>' +
      '<span class="nf-qty">' + escapeHtml(opt.qty || '') + '</span>' +
      '<span class="nf-kcal">' + (n ? Math.round(n.kcal) : '—') + '</span>' +
      (multi ? '<span class="nf-swap" aria-hidden="true">⇄ ' + (item.options.length - 1) + '</span>' : '<span class="nf-swap"></span>');
    row.setAttribute('aria-label', opt.food + ', ' + (opt.qty || '') + (multi ? '. Tocar para trocar' : ''));
    row.addEventListener('click', () => {
      nutriOpen = open ? null : key;
      renderNutriPlan();
    });
    wrap.appendChild(row);

    if (open) {
      const opts = document.createElement('div');
      opts.className = 'nf-opts';
      item.options.forEach((o, i) => {
        const on = o === opt;
        const on2 = optionNutrition(o);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'nf-opt' + (on ? ' is-on' : '');
        b.innerHTML = '<b>' + escapeHtml(o.food) + '</b><small>' + escapeHtml(o.qty || '') +
          (on2 ? ' · ' + Math.round(on2.kcal) + ' kcal' : '') + (i === 0 ? ' · base' : '') + '</small>';
        b.addEventListener('click', async () => {
          nutriChoices[key] = i;
          nutriOpen = null;
          await saveChoices();
          renderNutriPlan();
        });
        opts.appendChild(b);
      });
      wrap.appendChild(opts);
    }
    card.appendChild(wrap);
  });

  const extras = [];
  if ((meal.notes || []).length || (meal.ideas || []).length) {
    extras.push('<details class="nf-more"><summary>Dicas da nutricionista</summary>' +
      (meal.notes || []).map((x) => '<p>' + escapeHtml(x) + '</p>').join('') +
      ((meal.ideas || []).length ? '<ol>' + meal.ideas.map((x) => '<li>' + escapeHtml(x) + '</li>').join('') + '</ol>' : '') +
      '</details>');
  }
  if ((meal.recipes || []).length) {
    extras.push('<details class="nf-more"><summary>Receitas (' + meal.recipes.length + ')</summary>' +
      meal.recipes.map(recipeHtml).join('') + '</details>');
  }
  if (extras.length) card.insertAdjacentHTML('beforeend', extras.join(''));
  return card;
}

function recipeHtml(r) {
  const steps = Array.isArray(r.steps) ? r.steps : (r.steps ? [r.steps] : []);
  return '<div class="nf-recipe"><b>' + escapeHtml(r.title) + '</b>' +
    (r.yield ? '<small>' + escapeHtml(r.yield) + '</small>' : '') +
    '<ul>' + (r.ingredients || []).map((x) => '<li>' + escapeHtml(x) + '</li>').join('') + '</ul>' +
    (steps.length ? '<ol>' + steps.map((x) => '<li>' + escapeHtml(x) + '</li>').join('') + '</ol>' : '') + '</div>';
}

/* Usa o total do dia como calorias do plano de perda (treino e descanso). */
async function useNutriTotal(kcal) {
  if (!confirm('Usar ' + kcal + ' kcal como plano de perda nos dias de treino e de descanso?')) return;
  await DB.setSetting('dietKcalTrain', kcal);
  await DB.setSetting('dietKcalRest', kcal);
  await DB.setSetting('dietMode', 'loss');
  if (typeof loadDietPlan === 'function') await loadDietPlan();
  toast('Plano de perda: ' + kcal + ' kcal por dia');
}

/* ---------- Lista de compras ---------- */

function niceQty(g, isMl) {
  if (g >= 1000) return dec(g / 1000, 1) + (isMl ? ' L' : ' kg');
  if (g >= 100) return Math.round(g / 10) * 10 + (isMl ? ' ml' : ' g');
  return Math.round(g) + (isMl ? ' ml' : ' g');
}

/* Junta as escolhas actuais × dias, por nome de compra e secção. */
function buildShoppingList(days) {
  const items = {};
  const free = {};
  nutriPlan.meals.forEach((meal) => meal.items.forEach((item) => {
    const o = chosenOption(meal, item);
    const f = FOODS[o.food];
    const shop = f ? f.shop : o.food;
    const cat = f ? f.cat : 'Outros';
    if (o.free || (f && f.free)) { free[shop] = cat; return; }
    if (!(o.g > 0)) return;
    const grams = o.g * days * (f && f.buy ? f.buy : 1);
    const it = items[shop] || (items[shop] = { name: shop, cat: cat, g: 0, count: 0, unit: null,
      isMl: /leite|iogurte natural/i.test(shop) });
    it.g += grams;
    if (f && f.unitG) { it.count += grams / f.unitG; it.unit = f.unit; }
  }));
  return { items: Object.values(items), free: Object.keys(free).sort() };
}

function renderShopping() {
  document.querySelectorAll('#shop-days .seg').forEach((b) => {
    b.classList.toggle('is-active', Number(b.dataset.days) === nutriShop.days);
  });
  const list = buildShoppingList(nutriShop.days);
  const host = $('#shop-list');
  host.innerHTML = '';

  const byCat = {};
  list.items.forEach((it) => { (byCat[it.cat] = byCat[it.cat] || []).push(it); });
  const cats = SHOP_ORDER.filter((c) => byCat[c]).concat(Object.keys(byCat).filter((c) => SHOP_ORDER.indexOf(c) < 0));

  let total = 0, done = 0;
  cats.forEach((cat) => {
    const sec = document.createElement('section');
    sec.className = 'panel shop-sec';
    sec.innerHTML = '<h2>' + escapeHtml(cat) + '</h2>';
    byCat[cat].sort((a, b) => a.name.localeCompare(b.name, 'pt')).forEach((it) => {
      total++;
      if (nutriShop.checked[it.name]) done++;
      // Ovos, pão e fruta compram-se à unidade: a contagem vem primeiro.
      sec.appendChild(shopRow(it.name, it.count >= 1
        ? '≈ ' + Math.ceil(it.count - 0.05) + ' ' + it.unit + ' (' + niceQty(it.g, it.isMl) + ')'
        : niceQty(it.g, it.isMl)));
    });
    host.appendChild(sec);
  });

  if (list.free.length) {
    const sec = document.createElement('section');
    sec.className = 'panel shop-sec';
    sec.innerHTML = '<h2>À vontade (folhas e legumes)</h2>';
    list.free.forEach((name) => {
      total++;
      if (nutriShop.checked[name]) done++;
      sec.appendChild(shopRow(name, 'para ' + nutriShop.days + (nutriShop.days === 1 ? ' dia' : ' dias')));
    });
    host.appendChild(sec);
  }

  $('#shop-progress').textContent = done + ' de ' + total + ' no carrinho';
  $('#btn-shop-clear').disabled = !done;
}

function shopRow(name, qty) {
  const row = document.createElement('label');
  row.className = 'shop-row' + (nutriShop.checked[name] ? ' is-done' : '');
  row.innerHTML = '<input type="checkbox"' + (nutriShop.checked[name] ? ' checked' : '') + '>' +
    '<span class="shop-name">' + escapeHtml(name) + '</span><span class="shop-qty">' + escapeHtml(qty) + '</span>';
  row.querySelector('input').addEventListener('change', async (ev) => {
    if (ev.target.checked) nutriShop.checked[name] = true;
    else delete nutriShop.checked[name];
    await saveShop();
    renderShopping();
  });
  return row;
}

/* ---------- Orientações e receitas ---------- */

function renderGuides() {
  const g = nutriPlan.guidelines || [];
  const r = nutriPlan.recipes || [];
  $('#nutri-guides').innerHTML =
    g.map((s) => '<section class="panel"><h2>' + escapeHtml(s.title) + '</h2><ul class="ng-list">' +
      (s.items || []).map((x) => '<li>' + escapeHtml(x) + '</li>').join('') + '</ul></section>').join('') +
    (r.length ? '<section class="panel"><h2>Receitas</h2>' +
      r.map((x) => '<details class="nf-more"><summary>' + escapeHtml(x.title) + '</summary>' + recipeHtml(x) + '</details>').join('') +
      '</section>' : '');
}

/* ---------- Importar / exportar ---------- */

function validNutriPlan(p) {
  return p && p.format === 'sportstrack-nutri' && Array.isArray(p.meals) &&
    p.meals.every((m) => m.id && Array.isArray(m.items) && m.items.every((i) => i.id && Array.isArray(i.options) && i.options.length));
}

async function importNutriPlan(file) {
  try {
    const p = JSON.parse(await file.text());
    if (!validNutriPlan(p)) return toast('Este ficheiro não é um plano alimentar da app.');
    if (nutriPlan && !confirm('Substituir o plano actual por "' + p.name + '"? As escolhas voltam à opção base.')) return;
    await DB.setNutri({ id: 'plan', plan: p, importedAt: new Date().toISOString() });
    await DB.setNutri({ id: 'selection', choices: {} });
    nutriView = 'plano';
    await renderNutri();
    toast('Plano importado: ' + p.name);
  } catch (err) {
    toast('Ficheiro inválido: ' + err.message);
  }
}

async function loadDemoNutriPlan() {
  if (nutriPlan && !confirm('Substituir o plano actual pelo plano de exemplo?')) return;
  await DB.setNutri({ id: 'plan', plan: DEMO_NUTRI_PLAN, importedAt: new Date().toISOString() });
  await DB.setNutri({ id: 'selection', choices: {} });
  nutriView = 'plano';
  await renderNutri();
  toast('Plano de exemplo carregado (fictício)');
}

function exportNutriPlan() {
  if (!nutriPlan) return;
  downloadFile(JSON.stringify(nutriPlan, null, 2), 'plano-alimentar.json', 'application/json');
}

async function clearNutriPlan() {
  if (!confirm('Apagar o plano alimentar desta app? (O ficheiro original não é afectado.)')) return;
  await DB.deleteNutri('plan');
  await DB.deleteNutri('selection');
  await renderNutri();
  toast('Plano apagado');
}

function bindNutriEvents() {
  document.querySelectorAll('#nutri-tabs .seg').forEach((b) => {
    b.addEventListener('click', () => { nutriView = b.dataset.nview; nutriOpen = null; renderNutri(); window.scrollTo(0, 0); });
  });
  document.querySelectorAll('#shop-days .seg').forEach((b) => {
    b.addEventListener('click', async () => { nutriShop.days = Number(b.dataset.days); await saveShop(); renderShopping(); });
  });
  $('#btn-shop-clear').addEventListener('click', async () => {
    nutriShop.checked = {};
    await saveShop();
    renderShopping();
  });
  $('#btn-nutri-import').addEventListener('click', () => $('#file-nutri').click());
  $('#btn-nutri-import2').addEventListener('click', () => $('#file-nutri').click());
  $('#file-nutri').addEventListener('change', (ev) => {
    const f = ev.target.files[0];
    if (f) importNutriPlan(f);
    ev.target.value = '';
  });
  $('#btn-nutri-demo').addEventListener('click', loadDemoNutriPlan);
  $('#btn-nutri-demo2').addEventListener('click', loadDemoNutriPlan);
  $('#btn-nutri-export').addEventListener('click', exportNutriPlan);
  $('#btn-nutri-clear').addEventListener('click', clearNutriPlan);
}
