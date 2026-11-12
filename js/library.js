/* library.js — treinos pré-definidos para importar (sobretudo para o Treino 2).
 *
 * Duas fontes:
 *  - a biblioteca que vem com a app (peso corporal, corrida, core), cada um
 *    com o WOD completo e a configuração do timer;
 *  - um ficheiro JSON (presets exportados desta app, de outro telemóvel ou
 *    enviados pelo coach), no formato {format:'sportstrack-presets', presets:[…]}.
 *    Também aceita uma cópia de segurança completa (lê só os presets).
 *
 * Importar cria presets normais (slot 2 por omissão): aparecem no editor,
 * na lista de Definições e no timer. No editor, os da biblioteca que ainda
 * não foram importados também se podem aplicar directamente. */

const LIBRARY_EXERCISES = [
  ['Mountain Climber', 'other', 'reps'],
  ['Squat Jump', 'other', 'reps'],
  ['Glute Bridge', 'other', 'reps'],
  ['High Knees', 'other', 's']
];

const WORKOUT_LIBRARY = [
  {
    key: 'tabata-core', name: 'Tabata core', tag: 'Core', format: 'other', roundsPlanned: null, capMin: null,
    description: 'Tabata 1: hollow rock / mountain climber\nTabata 2: prancha / V-up alternado\n(8 × 20" de esforço e 10" de pausa, alternando; 1\' entre tabatas)',
    movements: [
      { name: 'Hollow Rock', qty: null, everyRound: false, scheme: 'Tabata 1 · 4 × 20" máx' },
      { name: 'Mountain Climber', qty: null, everyRound: false, scheme: 'Tabata 1 · 4 × 20" máx' },
      { name: 'Plank', qty: 80, everyRound: false, scheme: 'Tabata 2 · 4 × 20"' },
      { name: 'Alternating V-up', qty: null, everyRound: false, scheme: 'Tabata 2 · 4 × 20" máx' }
    ],
    timer: { mode: 'intervals', blockRest: 60, blocks: [
      { rounds: 8, work: 20, rest: 10, labels: ['Hollow rock', 'Mountain climber'] },
      { rounds: 8, work: 20, rest: 10, labels: ['Prancha', 'V-up alternado'] }] }
  },
  {
    key: 'tabata-pernas', name: 'Tabata pernas', tag: 'Pernas', format: 'other', roundsPlanned: null, capMin: null,
    description: 'Tabata 1: air squat / reverse lunge\nTabata 2: squat jump / glute bridge\n(8 × 20"/10", alternando; 1\' entre tabatas)',
    movements: [
      { name: 'Air Squat', qty: null, everyRound: false, scheme: 'Tabata 1 · 4 × 20" máx' },
      { name: 'Reverse Lunge', qty: null, everyRound: false, scheme: 'Tabata 1 · 4 × 20" máx' },
      { name: 'Squat Jump', qty: null, everyRound: false, scheme: 'Tabata 2 · 4 × 20" máx' },
      { name: 'Glute Bridge', qty: null, everyRound: false, scheme: 'Tabata 2 · 4 × 20" máx' }
    ],
    timer: { mode: 'intervals', blockRest: 60, blocks: [
      { rounds: 8, work: 20, rest: 10, labels: ['Air squat', 'Reverse lunge'] },
      { rounds: 8, work: 20, rest: 10, labels: ['Squat jump', 'Glute bridge'] }] }
  },
  {
    key: 'hiit-30-30', name: 'HIIT 30/30 · 3 blocos', tag: 'Condição', format: 'other', roundsPlanned: 3, capMin: null,
    description: '3 blocos de 6 exercícios, 30" de esforço e 30" de pausa; 1\' entre blocos:\nburpee, squat jump, mountain climber, polichinelo, flexão, skipping',
    movements: [
      { name: 'Burpee', qty: null, everyRound: true, scheme: '30" máx' },
      { name: 'Squat Jump', qty: null, everyRound: true, scheme: '30" máx' },
      { name: 'Mountain Climber', qty: null, everyRound: true, scheme: '30" máx' },
      { name: 'Jumping Jack', qty: null, everyRound: true, scheme: '30" máx' },
      { name: 'Push-up', qty: null, everyRound: true, scheme: '30" máx' },
      { name: 'High Knees', qty: 30, everyRound: true }
    ],
    timer: { mode: 'intervals', blockRest: 60, blocks: [1, 2, 3].map(() => (
      { rounds: 6, work: 30, rest: 30, labels: ['Burpee', 'Squat jump', 'Mountain climber', 'Polichinelo', 'Flexão', 'Skipping'] })) }
  },
  {
    key: 'core-40-20', name: 'Core 4 rondas · 40/20', tag: 'Core', format: 'other', roundsPlanned: 4, capMin: null,
    description: '4 rondas, 40" de esforço e 20" de pausa:\nprancha, prancha lateral, abdominais infra, V-up alternado, hollow rock',
    movements: [
      { name: 'Plank', qty: 40, everyRound: true },
      { name: 'Side Plank', qty: 40, everyRound: true },
      { name: 'Lying Leg Raise', qty: null, everyRound: true, scheme: '40" máx' },
      { name: 'Alternating V-up', qty: null, everyRound: true, scheme: '40" máx' },
      { name: 'Hollow Rock', qty: null, everyRound: true, scheme: '40" máx' }
    ],
    timer: { mode: 'intervals', blocks: [
      { rounds: 20, work: 40, rest: 20, labels: ['Prancha', 'Prancha lateral', 'Abdominais infra', 'V-up alternado', 'Hollow rock'] }] }
  },
  {
    key: 'emom-12', name: 'EMOM 12\' · peso corporal', tag: 'EMOM', format: 'emom', roundsPlanned: null, capMin: 12,
    description: 'A cada minuto, 12 minutos, rodando:\n1) 10 burpees  2) 15 air squats  3) 30" de prancha',
    movements: [
      { name: 'Burpee', qty: 40, everyRound: false, scheme: '4 × 10' },
      { name: 'Air Squat', qty: 60, everyRound: false, scheme: '4 × 15' },
      { name: 'Plank', qty: 120, everyRound: false, scheme: '4 × 30"' }
    ],
    timer: { mode: 'emom', emom: { every: 60, rounds: 12, labels: ['10 burpees', '15 air squats', '30" prancha'] } }
  },
  {
    key: 'emom-20', name: 'EMOM 20\' · 4 estações', tag: 'EMOM', format: 'emom', roundsPlanned: null, capMin: 20,
    description: 'A cada minuto, 20 minutos, rodando:\n1) 12 air squats  2) 10 flexões  3) 15 sit-ups  4) 24 mountain climbers',
    movements: [
      { name: 'Air Squat', qty: 60, everyRound: false, scheme: '5 × 12' },
      { name: 'Push-up', qty: 50, everyRound: false, scheme: '5 × 10' },
      { name: 'Sit-up', qty: 75, everyRound: false, scheme: '5 × 15' },
      { name: 'Mountain Climber', qty: 120, everyRound: false, scheme: '5 × 24' }
    ],
    timer: { mode: 'emom', emom: { every: 60, rounds: 20, labels: ['12 air squats', '10 flexões', '15 sit-ups', '24 mountain climbers'] } }
  },
  {
    key: 'amrap-15', name: 'AMRAP 15\' · 5-10-15', tag: 'AMRAP', format: 'amrap', roundsPlanned: null, capMin: 15,
    description: 'O máximo de rondas em 15 minutos:\n5 flexões, 10 sit-ups, 15 air squats',
    movements: [
      { name: 'Push-up', qty: 5, everyRound: true },
      { name: 'Sit-up', qty: 10, everyRound: true },
      { name: 'Air Squat', qty: 15, everyRound: true }
    ],
    timer: { mode: 'amrap', amrap: { min: 15 } }
  },
  {
    key: 'amrap-20-run', name: 'AMRAP 20\' · corrida', tag: 'AMRAP', format: 'amrap', roundsPlanned: null, capMin: 20,
    description: 'O máximo de rondas em 20 minutos:\n200 m de corrida, 10 burpees, 20 lunges',
    movements: [
      { name: 'Run', qty: 200, everyRound: true },
      { name: 'Burpee', qty: 10, everyRound: true },
      { name: 'Walking Lunge', qty: 20, everyRound: true }
    ],
    timer: { mode: 'amrap', amrap: { min: 20 } }
  },
  {
    key: 'ft-21-15-9', name: '21-15-9 · burpees e squats', tag: 'For time', format: 'forTime', roundsPlanned: 3, capMin: 12,
    description: 'Para tempo (limite 12\'):\n21-15-9 burpees e air squats',
    movements: [
      { name: 'Burpee', qty: 45, everyRound: false, scheme: '21-15-9' },
      { name: 'Air Squat', qty: 45, everyRound: false, scheme: '21-15-9' }
    ],
    timer: { mode: 'fortime', fortime: { capMin: 12, rounds: 3 } }
  },
  {
    key: 'ft-escada', name: 'Escada 1–10 · flexões e sit-ups', tag: 'For time', format: 'forTime', roundsPlanned: 10, capMin: 20,
    description: 'Para tempo (limite 20\'):\n1 flexão + 1 sit-up, 2 + 2, … até 10 + 10',
    movements: [
      { name: 'Push-up', qty: 55, everyRound: false, scheme: '1-2-3…10' },
      { name: 'Sit-up', qty: 55, everyRound: false, scheme: '1-2-3…10' }
    ],
    timer: { mode: 'fortime', fortime: { capMin: 20, rounds: 10 } }
  },
  {
    key: 'run-8x400', name: 'Corrida 8 × 400 m', tag: 'Corrida', format: 'other', roundsPlanned: null, capMin: null,
    description: '8 × 400 m forte, 90" de pausa',
    movements: [{ name: 'Run', qty: 3200, everyRound: false, scheme: '8 × 400 m, rest 90"' }],
    timer: { mode: 'intervals', blocks: [{ rounds: 8, work: 0, rest: 90, labels: ['400 m'] }] }
  },
  {
    key: 'run-6x800', name: 'Corrida 6 × 800 m', tag: 'Corrida', format: 'other', roundsPlanned: null, capMin: null,
    description: '6 × 800 m a ritmo de 5 km, 2\' de pausa',
    movements: [{ name: 'Run', qty: 4800, everyRound: false, scheme: '6 × 800 m, rest 2\'' }],
    timer: { mode: 'intervals', blocks: [{ rounds: 6, work: 0, rest: 120, labels: ['800 m'] }] }
  },
  {
    key: 'run-sprints', name: 'Sprints 10 × 100 m', tag: 'Corrida', format: 'other', roundsPlanned: null, capMin: null,
    description: '10 × 100 m a fundo, 1\' de pausa a andar',
    movements: [{ name: 'Run', qty: 1000, everyRound: false, scheme: '10 × 100 m, rest 60"' }],
    timer: { mode: 'intervals', blocks: [{ rounds: 10, work: 0, rest: 60, labels: ['100 m'] }] }
  },
  {
    key: 'run-fartlek', name: 'Fartlek 10 × 1\'/1\'', tag: 'Corrida', format: 'other', roundsPlanned: 10, capMin: null,
    description: '10 × (1\' rápido + 1\' em trote)',
    movements: [{ name: 'Run', qty: null, everyRound: false, scheme: '10 × (1\' rápido + 1\' trote)' }],
    timer: { mode: 'intervals', blocks: [{ rounds: 10, work: 60, rest: 60, labels: ['Rápido'], restLabel: 'Trote' }] }
  },
  {
    key: 'run-30', name: 'Corrida contínua 30\'', tag: 'Corrida', format: 'other', roundsPlanned: null, capMin: 30,
    description: '30 minutos a ritmo confortável (consegues falar)',
    movements: [{ name: 'Run', qty: null, everyRound: false, scheme: '30\' contínuos' }],
    timer: { mode: 'intervals', blocks: [{ rounds: 1, work: 1800, rest: 0, labels: ['Ritmo confortável'] }] }
  }
];

/* Timers dos presets do plano do coach. Ficam aqui, por id, para chegarem
 * também a quem já tinha os presets gravados antes de haver timer. */
const DEFAULT_PRESET_TIMERS = {
  'preset-t2-1': { mode: 'intervals', blockRest: 0, blocks: [
    { rounds: 10, work: 0, rest: 45, labels: ['200 m'] },
    { rounds: 12, work: 0, rest: 30, labels: ['150 m'] },
    { rounds: 14, work: 0, rest: 20, labels: ['100 m'] }] },
  'preset-t2-2': { mode: 'intervals', blockRest: 60, blocks: [
    { rounds: 1, work: 0, rest: 0, labels: ['A) 30 rondas: 1 burpee, 2 squats, 3 sit-ups, 4 lunges'] },
    { rounds: 8, work: 20, rest: 10, labels: ['Prancha ventral', 'Polichinelo'] },
    { rounds: 8, work: 20, rest: 10, labels: ['V-up alternado', 'Prancha lateral'] }] },
  'preset-t2-3': { mode: 'intervals', blockRest: 180, blocks: [
    { rounds: 3, work: 0, rest: 180, labels: ['1600 m'] },
    { rounds: 1, work: 0, rest: 0, labels: ['B) 100 polichinelos com squat + 200 V-ups'] }] },
  'preset-t2-4': { mode: 'fortime', fortime: { capMin: null, rounds: 10 } },
  'preset-t2-5': { mode: 'intervals', blockRest: 0, blocks: [
    { rounds: 12, work: 0, rest: 45, labels: ['200 m'] },
    { rounds: 14, work: 0, rest: 30, labels: ['150 m'] },
    { rounds: 16, work: 0, rest: 20, labels: ['100 m'] }] },
  'preset-t2-6': { mode: 'fortime', fortime: { capMin: null, rounds: null } }
};

function presetTimer(p) {
  if (!p) return null;
  if (p.timer) return p.timer;
  if (DEFAULT_PRESET_TIMERS[p.id]) return DEFAULT_PRESET_TIMERS[p.id];
  const key = /^lib[:-]/.test(p.id || '') ? p.id.slice(4) : null;
  const w = key && WORKOUT_LIBRARY.find((x) => x.key === key);
  return w ? w.timer : null;
}

/* 'lib:x' (biblioteca) e 'lib-x' (já importado) são o mesmo treino. */
function canonicalPresetId(id) {
  if (!id || !String(id).startsWith('lib:')) return id;
  const imported = 'lib-' + String(id).slice(4);
  return presetsCache.find((p) => p.id === imported) ? imported : id;
}

/* Um item da biblioteca no formato de preset. Aceita 'lib:<key>' ou 'lib-<key>'. */
function libraryPreset(id) {
  const key = String(id || '').replace(/^lib[:-]/, '');
  const w = WORKOUT_LIBRARY.find((x) => x.key === key);
  if (!w) return null;
  return {
    id: 'lib-' + w.key, name: w.name, slot: 2, weekday: null, format: w.format,
    roundsPlanned: w.roundsPlanned, capMin: w.capMin, description: w.description,
    movements: cloneJSON(w.movements), timer: cloneJSON(w.timer), source: 'biblioteca'
  };
}

function libraryNotImported() {
  return WORKOUT_LIBRARY.filter((w) => !presetsCache.find((p) => p.id === 'lib-' + w.key));
}

/* ---------- Janela de importação ---------- */

function openLibrary() {
  const host = $('#lib-list');
  host.innerHTML = '';
  WORKOUT_LIBRARY.forEach((w) => {
    const have = presetsCache.find((p) => p.id === 'lib-' + w.key);
    const item = document.createElement('label');
    item.className = 'lib-item';
    item.innerHTML =
      '<input type="checkbox" value="' + w.key + '">' +
      '<span class="lib-body"><b>' + escapeHtml(w.name) + '</b>' +
      '<small>' + escapeHtml(w.tag) + ' · ' + escapeHtml(timerSummary(w.timer)) + (have ? ' · já importado' : '') + '</small>' +
      '<span class="lib-desc">' + escapeHtml(w.description).replace(/\n/g, '<br>') + '</span></span>';
    host.appendChild(item);
  });
  host.querySelectorAll('input').forEach((c) => c.addEventListener('change', refreshLibraryButton));
  $('#lib-slot').value = '2';
  $('#lib-day').value = '';
  refreshLibraryButton();
  $('#lib-modal').hidden = false;
  document.body.classList.add('modal-open');
}

function closeLibrary() {
  $('#lib-modal').hidden = true;
  document.body.classList.remove('modal-open');
}

function refreshLibraryButton() {
  const n = $('#lib-list').querySelectorAll('input:checked').length;
  const slot = $('#lib-slot').value === '1' ? 'Treino 1' : 'Treino 2';
  const b = $('#btn-lib-add');
  b.disabled = !n;
  b.textContent = n ? 'Adicionar ' + n + ' ao ' + slot : 'Escolhe treinos';
}

async function addFromLibrary() {
  const keys = Array.from($('#lib-list').querySelectorAll('input:checked')).map((c) => c.value);
  if (!keys.length) return;
  const slot = Number($('#lib-slot').value) === 1 ? 1 : 2;
  const weekday = $('#lib-day').value ? Number($('#lib-day').value) : null;
  await ensureExercises(PRESET_EXERCISES.concat(LIBRARY_EXERCISES));
  for (const k of keys) {
    const p = libraryPreset(k);
    p.slot = slot;
    p.weekday = weekday;
    p.updatedAt = new Date().toISOString();
    await DB.savePreset(p);
  }
  presetsCache = await DB.getPresets();
  closeLibrary();
  renderPresetList();
  toast(keys.length + (keys.length === 1 ? ' treino importado' : ' treinos importados') + ' para o ' + (slot === 1 ? 'Treino 1' : 'Treino 2'));
}

/* ---------- Ficheiro ---------- */

function validPreset(p) {
  return p && typeof p.name === 'string' && p.name.trim() && Array.isArray(p.movements) &&
    p.movements.every((m) => m && typeof m.name === 'string' && m.name.trim());
}

async function importPresetsFile(file) {
  let list;
  try {
    const data = JSON.parse(await file.text());
    list = Array.isArray(data) ? data : (data && Array.isArray(data.presets) ? data.presets : null);
  } catch (err) {
    return toast('Ficheiro inválido: ' + err.message);
  }
  if (!list) return toast('Este ficheiro não tem treinos (presets) da app.');
  const ok = list.filter(validPreset);
  if (!ok.length) return toast('Não encontrei treinos válidos neste ficheiro.');
  const skipped = list.length - ok.length;
  const sameName = ok.filter((p) => presetsCache.find((e) => e.name.toLowerCase() === p.name.trim().toLowerCase()));
  const msg = 'Importar ' + ok.length + (ok.length === 1 ? ' treino' : ' treinos') +
    ' (os que não dizem o treino vão para o Treino 2)?' +
    (sameName.length ? '\n' + sameName.length + ' com o mesmo nome de um preset teu vão substituí-lo.' : '') +
    (skipped ? '\n' + skipped + ' sem nome ou movimentos ficam de fora.' : '');
  if (!confirm(msg)) return;

  // Movimentos que faltam no catálogo são criados pelo nome.
  const names = [];
  ok.forEach((p) => p.movements.forEach((m) => {
    if (!exerciseIdByName(m.name) && !names.find((n) => n[0].toLowerCase() === m.name.trim().toLowerCase())) {
      names.push([m.name.trim(), 'other', 'reps']);
    }
  }));
  if (names.length) await ensureExercises(names);

  for (const p of ok) {
    const same = presetsCache.find((e) => e.name.toLowerCase() === p.name.trim().toLowerCase());
    const num = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
    const rec = {
      id: same ? same.id : (typeof p.id === 'string' && p.id ? p.id : 'preset-' + DB.uid()),
      name: p.name.trim(),
      slot: p.slot === 1 ? 1 : 2,
      weekday: Number(p.weekday) >= 1 && Number(p.weekday) <= 7 ? Number(p.weekday) : (same ? same.weekday : null),
      format: ['forTime', 'amrap', 'emom', 'other'].includes(p.format) ? p.format : 'other',
      roundsPlanned: num(p.roundsPlanned),
      capMin: num(p.capMin),
      description: typeof p.description === 'string' ? p.description : '',
      movements: p.movements.map((m) => ({
        name: m.name.trim(),
        qty: num(m.qty),
        weightKg: num(m.weightKg),
        everyRound: m.everyRound !== false,
        scheme: typeof m.scheme === 'string' && m.scheme ? m.scheme : null
      })),
      updatedAt: new Date().toISOString()
    };
    if (p.timer && typeof p.timer === 'object') rec.timer = normalizeTimer(p.timer);
    await DB.savePreset(rec);
    // Um nome repetido dentro do próprio ficheiro substitui o anterior.
    presetsCache = await DB.getPresets();
  }
  renderPresetList();
  toast(ok.length + (ok.length === 1 ? ' treino importado' : ' treinos importados'));
}

function exportPresets() {
  if (!presetsCache.length) return toast('Ainda não há presets para exportar.');
  const out = presetsCache.map((p) => {
    const c = cloneJSON(p);
    const t = presetTimer(p);
    if (t && !c.timer) c.timer = cloneJSON(t);
    return c;
  });
  downloadFile(JSON.stringify({ format: 'sportstrack-presets', version: 1, exportedAt: new Date().toISOString(), presets: out }, null, 2),
    'treinos-presets-' + todayISO() + '.json', 'application/json');
  toast('Presets exportados');
}

function bindLibraryEvents() {
  $('#btn-presets-library').addEventListener('click', openLibrary);
  $('#btn-lib-close').addEventListener('click', closeLibrary);
  $('#btn-lib-add').addEventListener('click', addFromLibrary);
  $('#lib-slot').addEventListener('change', refreshLibraryButton);
  $('#lib-modal').addEventListener('click', (ev) => { if (ev.target.id === 'lib-modal') closeLibrary(); });
  $('#btn-presets-import').addEventListener('click', () => $('#file-presets').click());
  $('#file-presets').addEventListener('change', (ev) => {
    const f = ev.target.files[0];
    if (f) importPresetsFile(f);
    ev.target.value = '';
  });
  $('#btn-presets-export').addEventListener('click', exportPresets);
}
