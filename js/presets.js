/* presets.js — treinos-modelo ("presets") e o slot do treino no dia.
 *
 * Um preset guarda o WOD inteiro (formato, rondas, movimentos, esquema e
 * descrição). No registo escolhe-se o preset e só falta pôr tempo, calorias
 * e FC. Os presets são editáveis: em qualquer sessão, "Guardar como preset"
 * cria ou substitui um; em Definições mudam-se nome, dia e apaga-se.
 *
 * Slots: 1 = Treino 1 (CrossFit, ao almoço), 2 = Treino 2 (fim do dia).
 * Sessões antigas sem slot contam como Treino 1.
 *
 * Carregado antes do app.js; usa os globais dele só quando é chamado. */

const SLOT_LABELS = { 1: 'Treino 1 · CrossFit', 2: 'Treino 2' };
const WEEKDAYS_PT = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

function sessionSlot(s) {
  return s && s.slot === 2 ? 2 : 1;
}

/* 1 = segunda … 7 = domingo. */
function weekdayOf(dateISO) {
  const d = new Date(dateISO + 'T00:00:00').getDay();
  return d === 0 ? 7 : d;
}

/* Movimentos que os treinos 2 usam e o catálogo inicial não tinha.
 * Nomes em inglês, como o resto do catálogo; a descrição do preset fica em pt. */
const PRESET_EXERCISES = [
  ['Air Squat', 'other', 'reps'],
  ['Lunge', 'other', 'reps'],
  ['Reverse Lunge', 'other', 'reps'],
  ['Jumping Jack', 'other', 'reps'],
  ['Jumping Jack Squat', 'other', 'reps'],
  ['Alternating V-up', 'gymnastics', 'reps'],
  ['Plank', 'gymnastics', 's'],
  ['Side Plank', 'gymnastics', 's'],
  ['Sprawl', 'other', 'reps'],
  ['Lying Leg Raise', 'gymnastics', 'reps']
];

/* O plano do coach para o Treino 2 (segunda a sábado). */
const DEFAULT_PRESETS = [
  {
    id: 'preset-t2-1', name: 'Treino 2 · Segunda', slot: 2, weekday: 1, format: 'other',
    roundsPlanned: null, capMin: null,
    description: 'Corrida intervalada (5.200 m)\n10 × 200 m — rest 45"\n12 × 150 m — rest 30"\n14 × 100 m — rest 20"',
    movements: [
      { name: 'Run', qty: 2000, everyRound: false, scheme: '10 × 200 m, rest 45"' },
      { name: 'Run', qty: 1800, everyRound: false, scheme: '12 × 150 m, rest 30"' },
      { name: 'Run', qty: 1400, everyRound: false, scheme: '14 × 100 m, rest 20"' }
    ]
  },
  {
    id: 'preset-t2-2', name: 'Treino 2 · Terça', slot: 2, weekday: 2, format: 'other',
    roundsPlanned: 30, capMin: null,
    description: 'A) 30 rondas: 1 burpee, 2 squats, 3 sit-ups, 4 lunges\n' +
      'B) Tabata 1: prancha ventral / polichinelo\n   Tabata 2: V-up alternado / prancha lateral\n' +
      '(Tabata = 8 × 20" de esforço e 10" de pausa, alternando A e B)',
    movements: [
      { name: 'Burpee', qty: 1, everyRound: true },
      { name: 'Air Squat', qty: 2, everyRound: true },
      { name: 'Sit-up', qty: 3, everyRound: true },
      { name: 'Lunge', qty: 4, everyRound: true },
      { name: 'Plank', qty: 80, everyRound: false, scheme: 'Tabata 1 · 4 × 20"' },
      { name: 'Jumping Jack', qty: null, everyRound: false, scheme: 'Tabata 1 · 4 × 20" máx' },
      { name: 'Alternating V-up', qty: null, everyRound: false, scheme: 'Tabata 2 · 4 × 20" máx' },
      { name: 'Side Plank', qty: 80, everyRound: false, scheme: 'Tabata 2 · 4 × 20"' }
    ]
  },
  {
    id: 'preset-t2-3', name: 'Treino 2 · Quarta', slot: 2, weekday: 3, format: 'other',
    roundsPlanned: null, capMin: null,
    description: 'A) 3 × 1.600 m de corrida, 3\' entre eles\nB) 100 polichinelos com squat\n   200 V-ups alternados',
    movements: [
      { name: 'Run', qty: 4800, everyRound: false, scheme: '3 × 1600 m, 3\' entre eles' },
      { name: 'Jumping Jack Squat', qty: 100, everyRound: false },
      { name: 'Alternating V-up', qty: 200, everyRound: false }
    ]
  },
  {
    id: 'preset-t2-4', name: 'Treino 2 · Quinta', slot: 2, weekday: 4, format: 'forTime',
    roundsPlanned: 10, capMin: null,
    description: '10 rondas para tempo:\n10 sprawls\n10 reverse lunges\n10 abdominais infra\n20" prancha ventral',
    movements: [
      { name: 'Sprawl', qty: 10, everyRound: true },
      { name: 'Reverse Lunge', qty: 10, everyRound: true },
      { name: 'Lying Leg Raise', qty: 10, everyRound: true },
      { name: 'Plank', qty: 20, everyRound: true }
    ]
  },
  {
    id: 'preset-t2-5', name: 'Treino 2 · Sexta', slot: 2, weekday: 5, format: 'other',
    roundsPlanned: null, capMin: null,
    description: 'Corrida intervalada (6.100 m)\n12 × 200 m — rest 45"\n14 × 150 m — rest 30"\n16 × 100 m — rest 20"',
    movements: [
      { name: 'Run', qty: 2400, everyRound: false, scheme: '12 × 200 m, rest 45"' },
      { name: 'Run', qty: 2100, everyRound: false, scheme: '14 × 150 m, rest 30"' },
      { name: 'Run', qty: 1600, everyRound: false, scheme: '16 × 100 m, rest 20"' }
    ]
  },
  {
    id: 'preset-t2-6', name: 'Treino 2 · Sábado', slot: 2, weekday: 6, format: 'forTime',
    roundsPlanned: null, capMin: null,
    description: '5 km de corrida, à hora que der. Manda o tempo no grupo.',
    movements: [
      { name: 'Run', qty: 5000, everyRound: false }
    ]
  }
];

let presetsCache = [];

/* Na primeira vez: cria os movimentos em falta e grava os presets do plano.
 * Uma marca em definições impede que voltem se o utilizador os apagar. */
async function ensureDefaultPresets() {
  const seeded = await DB.getSetting('presetsSeeded', false);
  if (!seeded) {
    await ensureExercises(PRESET_EXERCISES);
    const existing = await DB.getPresets();
    for (const p of DEFAULT_PRESETS) {
      if (!existing.find((e) => e.id === p.id)) await DB.savePreset(p);
    }
    await DB.setSetting('presetsSeeded', true);
  }
  presetsCache = await DB.getPresets();
}

/* Garante que existem no catálogo (comparação pelo nome, sem maiúsculas). */
async function ensureExercises(list) {
  let changed = false;
  for (const [name, category, unit] of list) {
    if (!exercises.find((e) => e.name.toLowerCase() === name.toLowerCase())) {
      await DB.addExercise(name, category, unit);
      changed = true;
    }
  }
  if (changed) {
    exercises = await DB.getExercises();
    indexExercises();
    refreshExercisePickers();
  }
}

function exerciseIdByName(name) {
  const e = exercises.find((x) => x.name.toLowerCase() === String(name).toLowerCase());
  return e ? e.id : null;
}

/* ---------- No editor de sessão ---------- */

function setEditorSlot(slot) {
  editor.slot = slot === 2 ? 2 : 1;
  document.querySelectorAll('#f-slot .seg').forEach((b) => {
    b.classList.toggle('is-active', Number(b.dataset.slot) === editor.slot);
  });
}

/* Slot por omissão numa sessão nova: se já há um Treino 1 nesse dia, ou já
 * passa das 15h, é o Treino 2. */
async function guessSlot(dateISO) {
  const sameDay = (await DB.getSessions()).filter((s) => s.date === dateISO);
  if (sameDay.some((s) => sessionSlot(s) === 1)) return 2;
  return new Date().getHours() >= 15 ? 2 : 1;
}

/* Lista de presets no editor, com o do dia (e do slot) marcado como sugestão. */
function fillPresetSelect(dateISO) {
  const sel = $('#f-preset');
  const wd = weekdayOf(dateISO);
  sel.innerHTML = '<option value="">Usar um preset…</option>';
  const suggested = presetsCache.find((p) => p.weekday === wd && p.slot === editor.slot);
  presetsCache.forEach((p) => {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = (p === suggested ? '★ ' : '') + p.name;
    sel.appendChild(o);
  });
  $('#preset-suggest').textContent = suggested
    ? 'Sugerido para ' + WEEKDAYS_PT[wd].toLowerCase() + ': ' + suggested.name
    : '';
}

/* Preenche o WOD com o preset. Tempo, calorias e FC ficam por preencher. */
async function applyPreset(id) {
  const p = presetsCache.find((x) => x.id === id);
  if (!p) return;
  const hasWod = $('#f-wod-name').value.trim() || wodMovements.length;
  if (hasWod && !confirm('Substituir o WOD desta sessão pelo preset "' + p.name + '"?')) return;

  // Movimentos que ainda não estão no catálogo são criados (pelo nome).
  const missing = p.movements.filter((m) => !exerciseIdByName(m.name)).map((m) => [m.name, 'other', 'reps']);
  if (missing.length) await ensureExercises(missing);

  setEditorSlot(p.slot || 2);
  $('#f-wod-name').value = p.name;
  $('#f-wod-format').value = p.format || 'other';
  $('#f-wod-cap').value = p.capMin != null ? p.capMin : '';
  $('#f-wod-rounds-planned').value = p.roundsPlanned != null ? p.roundsPlanned : '';
  $('#f-wod-desc').value = p.description || '';
  wodMovements = p.movements.map((m) => ({
    exerciseId: exerciseIdByName(m.name),
    qty: m.qty != null ? m.qty : null,
    weightKg: m.weightKg != null ? m.weightKg : null,
    everyRound: m.everyRound !== false,
    scheme: m.scheme || null
  }));
  renderWodMovements();
  refreshWodFields();
  document.querySelectorAll('#view-editor details.block').forEach((d) => { d.open = true; });
  toast('Preset aplicado · falta o tempo, kcal e FC');
}

/* Cria ou substitui um preset a partir do WOD que está no editor. */
async function savePresetFromEditor() {
  const moves = wodMovements.filter((m) => m.exerciseId);
  if (!moves.length && !$('#f-wod-desc').value.trim()) {
    return toast('Preenche o WOD antes de o guardar como preset.');
  }
  const date = $('#f-date').value || todayISO();
  const suggestion = $('#f-wod-name').value.trim() ||
    (editor.slot === 2 ? 'Treino 2' : 'Treino 1') + ' · ' + WEEKDAYS_PT[weekdayOf(date)];
  const name = prompt('Nome do preset:', suggestion);
  if (!name || !name.trim()) return;

  const same = presetsCache.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
  if (same && !confirm('Já existe "' + same.name + '". Substituir?')) return;

  const record = {
    id: same ? same.id : 'preset-' + DB.uid(),
    name: name.trim(),
    slot: editor.slot,
    weekday: same ? same.weekday : weekdayOf(date),
    format: $('#f-wod-format').value,
    roundsPlanned: numOrNull($('#f-wod-rounds-planned').value),
    capMin: numOrNull($('#f-wod-cap').value),
    description: $('#f-wod-desc').value.trim(),
    movements: moves.map((m) => ({
      name: exerciseName(m.exerciseId),
      qty: m.qty != null ? m.qty : null,
      weightKg: m.weightKg != null ? m.weightKg : null,
      everyRound: m.everyRound !== false,
      scheme: m.scheme || null
    })),
    updatedAt: new Date().toISOString()
  };
  await DB.savePreset(record);
  presetsCache = await DB.getPresets();
  fillPresetSelect(date);
  toast('Preset guardado: ' + record.name);
}

/* ---------- Em Definições: lista de presets ---------- */

function renderPresetList() {
  const host = $('#preset-list');
  host.innerHTML = '';
  if (!presetsCache.length) {
    host.innerHTML = '<p class="chart-empty">Sem presets. Cria um com "Guardar como preset" numa sessão.</p>';
    return;
  }
  presetsCache.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'preset-item';

    const info = document.createElement('div');
    info.className = 'preset-info';
    info.innerHTML = '<b>' + escapeHtml(p.name) + '</b><small>' +
      escapeHtml(SLOT_LABELS[p.slot] || 'Treino') + ' · ' + p.movements.length + ' movimentos</small>';

    const day = document.createElement('select');
    day.setAttribute('aria-label', 'Dia do preset ' + p.name);
    WEEKDAYS_PT.forEach((label, i) => {
      const o = document.createElement('option');
      o.value = i ? String(i) : '';
      o.textContent = i ? label.slice(0, 3) : 'Sem dia';
      day.appendChild(o);
    });
    day.value = p.weekday ? String(p.weekday) : '';
    day.addEventListener('change', async () => {
      await DB.savePreset(Object.assign({}, p, { weekday: day.value ? Number(day.value) : null }));
      presetsCache = await DB.getPresets();
      renderPresetList();
    });

    const slot = document.createElement('select');
    slot.setAttribute('aria-label', 'Treino do preset ' + p.name);
    [['1', 'T1'], ['2', 'T2']].forEach(([v, l]) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = l;
      slot.appendChild(o);
    });
    slot.value = String(p.slot || 2);
    slot.addEventListener('change', async () => {
      await DB.savePreset(Object.assign({}, p, { slot: Number(slot.value) }));
      presetsCache = await DB.getPresets();
      renderPresetList();
    });

    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'set-remove';
    rename.textContent = '✎';
    rename.setAttribute('aria-label', 'Mudar o nome de ' + p.name);
    rename.addEventListener('click', async () => {
      const name = prompt('Novo nome:', p.name);
      if (!name || !name.trim()) return;
      await DB.savePreset(Object.assign({}, p, { name: name.trim() }));
      presetsCache = await DB.getPresets();
      renderPresetList();
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'set-remove';
    del.textContent = '×';
    del.setAttribute('aria-label', 'Apagar ' + p.name);
    del.addEventListener('click', async () => {
      if (!confirm('Apagar o preset "' + p.name + '"? As sessões já registadas não mudam.')) return;
      await DB.deletePreset(p.id);
      presetsCache = await DB.getPresets();
      renderPresetList();
      toast('Preset apagado');
    });

    row.appendChild(info);
    row.appendChild(day);
    row.appendChild(slot);
    row.appendChild(rename);
    row.appendChild(del);
    host.appendChild(row);
  });
}

/* Repõe os presets do plano original (sem apagar os que criaste). */
async function restoreDefaultPresets() {
  await ensureExercises(PRESET_EXERCISES);
  for (const p of DEFAULT_PRESETS) await DB.savePreset(p);
  presetsCache = await DB.getPresets();
  renderPresetList();
  toast('Presets do plano repostos');
}

function bindPresetEvents() {
  document.querySelectorAll('#f-slot .seg').forEach((b) => {
    b.addEventListener('click', () => {
      setEditorSlot(Number(b.dataset.slot));
      fillPresetSelect($('#f-date').value || todayISO());
    });
  });
  $('#f-preset').addEventListener('change', async (ev) => {
    const id = ev.target.value;
    ev.target.value = '';
    if (id) await applyPreset(id);
  });
  $('#f-date').addEventListener('change', () => fillPresetSelect($('#f-date').value || todayISO()));
  $('#btn-save-preset').addEventListener('click', savePresetFromEditor);
  $('#btn-presets-restore').addEventListener('click', restoreDefaultPresets);
}
