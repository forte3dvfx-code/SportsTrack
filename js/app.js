/* app.js — interface e lógica de ecrã.
 * Toda a persistência passa pelo objecto DB definido em db.js.
 * Os gráficos passam pelo objecto Chart definido em chart.js. */

const MONTHS_PT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

const MEASURE_LABELS = {
  waist: 'Cintura', hip: 'Anca', chest: 'Peito',
  armR: 'Braço direito', thighR: 'Coxa direita', neck: 'Pescoço'
};

/* A faixa deixou de ser uma etiqueta escolhida e passou a sair da
 * percentagem do PR a que trabalhaste. Marcas 78% e a app sabe que foi
 * trabalho de base; marcas 96% e sabe que foi tentativa de máximo. */
function bandFromPct(pct) {
  if (pct == null || !isFinite(pct)) return null;
  if (pct >= 95) return 'teste';
  if (pct >= 83) return 'pesado';
  if (pct >= 65) return 'moderado';
  return 'leve';
}

const BAND_RANGES = {
  leve: '< 65%', moderado: '65–82%', pesado: '83–94%', teste: '≥ 95%', '': '—'
};

const INTENTS = {
  leve:      { label: 'Leve',      color: '#6E8AA8' },
  moderado:  { label: 'Moderado',  color: '#4A90D9' },
  pesado:    { label: 'Pesado',    color: '#C2543E' },
  teste:     { label: 'Teste PR',  color: '#E9E7E2' },
  '':        { label: 'Sem referência', color: '#5C6675' }
};

const INTENT_ORDER = ['leve', 'moderado', 'pesado', 'teste', ''];

let exercises = [];          // catálogo carregado uma vez
let exercisesById = {};      // atalho id -> registo
let wodNamesSeen = [];       // alimenta o autocompletar de nomes de WOD

let wodScaling = 'rx';       // 'rxplus' | 'rx' | 'scaled'
let wodMovements = [];       // [{ exerciseId, reps, weightKg }] do WOD em edição
let editor = null;           // estado do editor de sessão
let bodyEditor = null;       // estado do editor de medição

const $ = (sel) => document.querySelector(sel);

/* ---------- Arranque ---------- */

async function init() {
  await DB.openDB();
  exercises = await DB.seedExercisesIfEmpty();
  indexExercises();
  fillExercisePicker();
  weeklyTarget = Number(await DB.getSetting('weeklyTarget', 5));
  bindEvents();
  await renderSessionList();
  await loadDiet();
  await renderBodyList();
  await renderDietGrid();
  await refreshBackupState();
  registerServiceWorker();
  await switchTab('evolucao');   // a app abre na leitura, não no registo
  maybeAutoBackup();            // não bloqueia o arranque: corre em segundo plano
}

function indexExercises() {
  exercisesById = {};
  exercises.forEach((e) => { exercisesById[e.id] = e; });
}

function fillExercisePicker() {
  const pick = $('#f-exercise-pick');
  pick.innerHTML = '<option value="">Adicionar exercício…</option>';

  // Agrupado por categoria: encontra-se mais depressa do que numa lista corrida.
  ['barbell', 'dumbbell', 'gymnastics', 'other'].forEach((cat) => {
    const inCat = exercises.filter((e) => e.category === cat);
    if (!inCat.length) return;
    const group = document.createElement('optgroup');
    group.label = cat;
    inCat.forEach((e) => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.name;
      group.appendChild(opt);
    });
    pick.appendChild(group);
  });

  const newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = '+ Novo movimento…';
  pick.appendChild(newOpt);
}

/* ---------- Separadores ---------- */

async function switchTab(target) {
  document.querySelectorAll('#app > .view').forEach((v) => {
    v.hidden = v.dataset.view !== target;
  });
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('is-active', t.dataset.target === target);
  });
  $('#tabbar').hidden = false;
  window.scrollTo(0, 0);

  // Estes dois ecrãs recalculam à entrada em vez de manterem estado em memória:
  // é pouca conta e evita ficarem desactualizados depois de gravar noutro sítio.
  if (target === 'evolucao') await renderEvolution();
  if (target === 'definicoes') await renderSettings();
}

/* ---------- Lista de sessões ---------- */

async function renderSessionList() {
  const sessions = await DB.getSessions();
  const list = $('#session-list');
  list.innerHTML = '';

  $('#empty-sessions').hidden = sessions.length > 0;

  const details = await Promise.all(sessions.map(async (s) => ({
    session: s,
    sets: await DB.getSetsBySession(s.id),
    wods: await DB.getWodsBySession(s.id)
  })));

  const names = new Set();
  details.forEach((d) => d.wods.forEach((w) => { if (w.name) names.add(w.name); }));
  wodNamesSeen = Array.from(names).sort();

  details.forEach((d) => list.appendChild(buildCard(d)));
}

function buildCard({ session, sets, wods }) {
  const card = document.createElement('button');
  card.className = 'card';
  card.type = 'button';
  card.addEventListener('click', () => openEditor(session.id));

  card.appendChild(buildRail(session.date));

  const main = document.createElement('div');
  main.className = 'card-main';

  const metrics = [];
  if (session.durationMin) metrics.push(session.durationMin + ' min');
  if (session.calories) metrics.push(session.calories + ' kcal');
  if (session.avgHr) metrics.push(session.avgHr + ' bpm');
  if (metrics.length) {
    const el = document.createElement('div');
    el.className = 'card-metrics';
    metrics.forEach((t) => {
      const span = document.createElement('span');
      span.textContent = t;
      el.appendChild(span);
    });
    main.appendChild(el);
  }

  const working = sets.filter((s) => !s.warmup);
  const best = {};
  working.forEach((s) => {
    const current = best[s.exerciseId];
    if (!current) { best[s.exerciseId] = s; return; }
    // Sem carga, a melhor série é a de mais repetições; com carga, a mais pesada.
    const better = (s.weightKg > 0 || current.weightKg > 0)
      ? s.weightKg > current.weightKg
      : s.reps > current.reps;
    if (better) best[s.exerciseId] = s;
  });
  const bestList = Object.keys(best);

  if (bestList.length) {
    const el = document.createElement('div');
    el.className = 'card-lifts';
    bestList.slice(0, 3).forEach((exId) => {
      const s = best[exId];
      const detail = s.weightKg > 0
        ? '<b>' + s.weightKg + '</b> × ' + s.reps
        : '<b>' + s.reps + '</b> reps';
      const line = document.createElement('div');
      line.innerHTML = escapeHtml(exerciseName(exId)) + '  ' + detail;
      el.appendChild(line);
    });
    if (bestList.length > 3) {
      const more = document.createElement('div');
      more.textContent = '+ ' + (bestList.length - 3) + ' movimentos';
      more.style.color = 'var(--ink-faint)';
      el.appendChild(more);
    }
    main.appendChild(el);
  }

  if (wods.length && (wods[0].name || wods[0].description ||
      (wods[0].movements && wods[0].movements.length))) {
    const w = wods[0];
    const el = document.createElement('div');
    el.className = 'card-wod';
    el.innerHTML = '<strong>' + escapeHtml(w.name || 'WOD') + '</strong>' +
      (wodResult(w) ? ' · ' + escapeHtml(wodResult(w)) : '') +
      ' · ' + scalingLabel(w);
    main.appendChild(el);

    const moves = movementsText(w);
    if (moves) {
      const sub = document.createElement('div');
      sub.className = 'card-wod-moves';
      sub.textContent = moves;
      main.appendChild(sub);
    }
  }

  const volume = working.reduce((sum, s) => sum + (s.reps * s.weightKg), 0);
  if (volume > 0) {
    const el = document.createElement('div');
    el.className = 'card-volume';
    el.textContent = 'Volume ' + Math.round(volume).toLocaleString('pt-PT') + ' kg';
    main.appendChild(el);
  }

  card.appendChild(main);
  return card;
}

function buildRail(dateISO) {
  const [y, m, day] = dateISO.split('-');
  const rail = document.createElement('div');
  rail.className = 'card-rail';
  rail.innerHTML =
    '<div class="card-day">' + day + '</div>' +
    '<span class="card-month">' + MONTHS_PT[Number(m) - 1] + ' ' + y.slice(2) + '</span>';
  return rail;
}

function exerciseName(id) {
  return exercisesById[id] ? exercisesById[id].name : 'Movimento removido';
}

const SCALING_LABELS = { rxplus: 'Rx+', rx: 'Rx', scaled: 'Scaled' };

function scalingLabel(w) {
  return SCALING_LABELS[w.scaling] || 'Scaled';
}

function wodResult(w) {
  if (w.format === 'amrap' && w.rounds != null) {
    return w.rounds + (w.extraReps ? '+' + w.extraReps : '') + ' rondas';
  }
  if (w.finished === false) {
    const cap = w.capMin != null ? 'CAP ' + w.capMin + ':00' : 'CAP';
    return cap + (w.repsDone != null ? ' · ' + w.repsDone + ' reps' : '');
  }
  if (w.timeSec != null) {
    const min = Math.floor(w.timeSec / 60);
    const sec = w.timeSec % 60;
    return min + ':' + String(sec).padStart(2, '0');
  }
  return '';
}

/* ---------- Editor de sessão ---------- */

async function openEditor(sessionId) {
  let session = null;
  let sets = [];
  let wods = [];

  if (sessionId) {
    session = await DB.getSession(sessionId);
    sets = await DB.getSetsBySession(sessionId);
    wods = await DB.getWodsBySession(sessionId);
  }

  editor = {
    id: session ? session.id : DB.uid(),
    groups: groupSets(sets)
  };

  $('#editor-title').textContent = session ? 'Editar sessão' : 'Nova sessão';
  $('#btn-delete').hidden = !session;

  $('#f-date').value = session ? session.date : todayISO();
  $('#f-duration').value = session && session.durationMin != null ? session.durationMin : '';
  $('#f-calories').value = session && session.calories != null ? session.calories : '';
  $('#f-avghr').value = session && session.avgHr != null ? session.avgHr : '';
  $('#f-notes').value = session ? (session.notes || '') : '';

  const w = wods[0] || null;
  $('#f-wod-name').value = w ? (w.name || '') : '';
  $('#f-wod-format').value = w ? w.format : 'forTime';
  setWodScaling(w ? (w.scaling || 'rx') : 'rx');
  $('#f-wod-min').value = w && w.timeSec != null ? Math.floor(w.timeSec / 60) : '';
  $('#f-wod-sec').value = w && w.timeSec != null ? w.timeSec % 60 : '';
  // Nos WODs antigos marcados como "bateu no cap" o tempo gravado já era o
  // do limite, por isso o cálculo devolve o mesmo resultado sem conversão.
  $('#f-wod-rounds').value = w && w.rounds != null ? w.rounds : '';
  $('#f-wod-extra').value = w && w.extraReps != null ? w.extraReps : '';
  $('#f-wod-cap').value = w && w.capMin != null ? w.capMin : '';
  $('#f-wod-repsdone').value = w && w.repsDone != null ? w.repsDone : '';
  $('#f-wod-desc').value = w ? (w.description || '') : '';

  // WODs gravados antes de haver movimentos tinham uma carga única.
  // Essa carga é recuperada como primeiro movimento sem nome definido,
  // para não se perder ao reabrir a sessão.
  wodMovements = (w && Array.isArray(w.movements))
    ? w.movements.map((m) => ({
        exerciseId: m.exerciseId,
        reps: m.reps != null ? m.reps : '',
        weightKg: m.weightKg != null ? m.weightKg : null
      }))
    : [];
  if (w && !wodMovements.length && w.weightKg != null) {
    wodMovements.push({ exerciseId: null, reps: '', weightKg: w.weightKg });
  }
  renderWodMovements();



  refreshWodFields();
  fillWodNames();
  renderGroups();
  showOnly('#view-editor');
}

function showOnly(selector) {
  document.querySelectorAll('#app > .view').forEach((v) => { v.hidden = true; });
  $(selector).hidden = false;
  $('#tabbar').hidden = true;
  window.scrollTo(0, 0);
}

function groupSets(sets) {
  const groups = [];
  const byExercise = {};
  sets.forEach((s) => {
    if (!byExercise[s.exerciseId]) {
      byExercise[s.exerciseId] = {
        exerciseId: s.exerciseId,
        pctPr: s.pctPr != null ? s.pctPr : null,
        sets: []
      };
      groups.push(byExercise[s.exerciseId]);
    }
    byExercise[s.exerciseId].sets.push({
      reps: s.reps,
      weightKg: s.weightKg,
      warmup: !!s.warmup
    });
  });
  return groups;
}

function fillWodNames() {
  const dl = $('#wod-names');
  dl.innerHTML = '';
  wodNamesSeen.forEach((n) => {
    const opt = document.createElement('option');
    opt.value = n;
    dl.appendChild(opt);
  });
}

function setWodScaling(value) {
  wodScaling = value;
  document.querySelectorAll('#wod-scaling .seg').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.scaling === value);
  });
}

/* O resultado não se marca: sai da comparação entre o tempo registado e o
 * limite. Bater exactamente no limite conta como não ter concluído — quem
 * acaba, acaba antes. */
function computeWodOutcome() {
  const capMin = numOrNull($('#f-wod-cap').value);
  const min = numOrNull($('#f-wod-min').value);
  const sec = numOrNull($('#f-wod-sec').value);
  const hasTime = (min != null || sec != null);
  const timeSec = hasTime ? ((min || 0) * 60 + (sec || 0)) : null;

  if (capMin == null || timeSec == null) {
    return { capMin: capMin, timeSec: timeSec, capped: false, known: false };
  }
  return {
    capMin: capMin,
    timeSec: timeSec,
    capped: timeSec >= capMin * 60,
    known: true
  };
}

function refreshWodFields() {
  const format = $('#f-wod-format').value;
  const isAmrap = (format === 'amrap');

  // Num AMRAP não se bate no tempo: o tempo é fixo e o resultado são rondas.
  $('#wod-round-fields').hidden = !isAmrap;
  $('#wod-time-fields').hidden = isAmrap;
  $('#wod-cap-field').hidden = isAmrap;

  const outcome = computeWodOutcome();
  const note = $('#wod-outcome-note');

  if (isAmrap || !outcome.known) {
    note.hidden = true;
    $('#wod-reps-field').hidden = true;
    return;
  }

  note.hidden = false;
  note.className = 'outcome-note ' + (outcome.capped ? 'is-capped' : 'is-done');
  note.textContent = outcome.capped
    ? 'Bateste no limite de ' + outcome.capMin + ':00.'
    : 'Concluíste dentro do limite, com ' +
      fmtTime(outcome.capMin * 60 - outcome.timeSec) + ' de sobra.';

  // O campo de repetições só faz sentido quando não acabaste.
  $('#wod-reps-field').hidden = !outcome.capped;
}

function renderGroups() {
  const host = $('#groups');
  host.innerHTML = '';

  editor.groups.forEach((group, gi) => {
    const el = document.createElement('div');
    el.className = 'group';

    const head = document.createElement('div');
    head.className = 'group-head';
    const name = document.createElement('span');
    name.className = 'group-name';
    name.textContent = exerciseName(group.exerciseId);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'group-remove';
    remove.textContent = 'remover';
    remove.addEventListener('click', () => {
      editor.groups.splice(gi, 1);
      renderGroups();
    });
    head.appendChild(name);
    head.appendChild(remove);
    el.appendChild(head);

    // Percentagem do PR a que este movimento foi trabalhado. Em branco,
    // a app calcula pela carga contra o teu melhor registo — mas o valor
    // que escreveres ganha sempre, porque só tu sabes o plano do dia.
    const pctRow = document.createElement('div');
    pctRow.className = 'pct-row';
    const pctLabel = document.createElement('span');
    pctLabel.className = 'pct-label';
    pctLabel.textContent = '% do PR';
    const pctInput = document.createElement('input');
    pctInput.type = 'number';
    pctInput.inputMode = 'numeric';
    pctInput.min = '0';
    pctInput.max = '150';
    pctInput.step = '1';
    pctInput.placeholder = 'auto';
    pctInput.value = group.pctPr != null ? group.pctPr : '';
    pctInput.setAttribute('aria-label', 'Percentagem do PR para ' + exerciseName(group.exerciseId));
    pctInput.addEventListener('input', () => {
      group.pctPr = numOrNull(pctInput.value);
      pctHint.textContent = bandHintFor(group.pctPr);
    });
    const pctHint = document.createElement('span');
    pctHint.className = 'pct-hint';
    pctHint.textContent = bandHintFor(group.pctPr);

    pctRow.appendChild(pctLabel);
    pctRow.appendChild(pctInput);
    pctRow.appendChild(pctHint);
    el.appendChild(pctRow);

    group.sets.forEach((set, si) => el.appendChild(buildSetRow(group, gi, set, si)));

    const actions = document.createElement('div');
    actions.className = 'group-actions';

    const addSet = document.createElement('button');
    addSet.type = 'button';
    addSet.className = 'btn-secondary';
    addSet.textContent = '+ Série';
    addSet.addEventListener('click', () => {
      group.sets.push({ reps: null, weightKg: null, warmup: false });
      renderGroups();
    });

    const repeat = document.createElement('button');
    repeat.type = 'button';
    repeat.className = 'btn-secondary';
    repeat.textContent = 'Repetir última';
    repeat.addEventListener('click', () => {
      const last = group.sets[group.sets.length - 1];
      group.sets.push(last
        ? { reps: last.reps, weightKg: last.weightKg, warmup: last.warmup }
        : { reps: null, weightKg: null, warmup: false });
      renderGroups();
    });

    actions.appendChild(addSet);
    actions.appendChild(repeat);
    el.appendChild(actions);
    host.appendChild(el);
  });
}

/* Movimentos do WOD. Ao contrário da força, aqui as repetições são texto
 * livre ("21-15-9", "max", "400 m"): um WOD raramente tem um número só, e
 * forçar um campo numérico obrigava a escrever o esquema na descrição. */
function renderWodMovements() {
  const host = $('#wod-movements');
  host.innerHTML = '';

  wodMovements.forEach((m, i) => {
    const row = document.createElement('div');
    row.className = 'wod-move';

    const name = document.createElement('select');
    name.className = 'wod-move-name';
    name.setAttribute('aria-label', 'Movimento ' + (i + 1));
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '—';
    name.appendChild(blank);
    exercises.forEach((e) => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.name;
      name.appendChild(opt);
    });
    name.value = m.exerciseId || '';
    name.addEventListener('change', () => { m.exerciseId = name.value || null; });

    const reps = document.createElement('input');
    reps.type = 'text';
    reps.className = 'wod-move-reps';
    reps.placeholder = 'reps';
    reps.value = m.reps || '';
    reps.setAttribute('aria-label', 'Repetições do movimento ' + (i + 1));
    reps.addEventListener('input', () => { m.reps = reps.value; });

    const kg = document.createElement('input');
    kg.type = 'number';
    kg.className = 'wod-move-kg';
    kg.inputMode = 'decimal';
    kg.min = '0';
    kg.step = '0.5';
    kg.placeholder = 'kg';
    kg.value = m.weightKg != null ? m.weightKg : '';
    kg.setAttribute('aria-label', 'Carga do movimento ' + (i + 1));
    kg.addEventListener('input', () => { m.weightKg = numOrNull(kg.value); });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'set-remove';
    del.textContent = '×';
    del.setAttribute('aria-label', 'Remover movimento ' + (i + 1));
    del.addEventListener('click', () => {
      wodMovements.splice(i, 1);
      renderWodMovements();
    });

    row.appendChild(name);
    row.appendChild(reps);
    row.appendChild(kg);
    row.appendChild(del);
    host.appendChild(row);
  });
}

function fillWodExercisePicker() {
  const pick = $('#f-wod-exercise-pick');
  pick.innerHTML = '<option value="">Adicionar movimento…</option>';

  ['barbell', 'dumbbell', 'gymnastics', 'other'].forEach((cat) => {
    const inCat = exercises.filter((e) => e.category === cat);
    if (!inCat.length) return;
    const group = document.createElement('optgroup');
    group.label = cat;
    inCat.forEach((e) => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.name;
      group.appendChild(opt);
    });
    pick.appendChild(group);
  });
}

/* Texto compacto dos movimentos, para cartões, tabelas e CSV. */
function movementsText(w) {
  if (!w || !Array.isArray(w.movements) || !w.movements.length) return '';
  return w.movements.map((m) => {
    const parts = [];
    if (m.reps) parts.push(m.reps);
    parts.push(m.exerciseId ? exerciseName(m.exerciseId) : 'movimento');
    if (m.weightKg != null) parts.push('@ ' + m.weightKg + ' kg');
    return parts.join(' ');
  }).join(' + ');
}

function bandHintFor(pct) {
  const band = bandFromPct(pct);
  if (!band) return 'calcula pela carga';
  return INTENTS[band].label;
}

function buildSetRow(group, gi, set, si) {
  const row = document.createElement('div');
  row.className = 'set-row' + (set.warmup ? ' is-warmup' : '');

  const index = document.createElement('span');
  index.className = 'set-index';
  index.textContent = (si + 1);

  const reps = document.createElement('input');
  reps.type = 'number';
  reps.inputMode = 'numeric';
  reps.min = '0';
  reps.step = '1';
  reps.placeholder = 'reps';
  reps.value = set.reps != null ? set.reps : '';
  reps.setAttribute('aria-label', 'Repetições da série ' + (si + 1));
  reps.addEventListener('input', () => { set.reps = numOrNull(reps.value); });

  const kg = document.createElement('input');
  kg.type = 'number';
  kg.inputMode = 'decimal';
  kg.min = '0';
  kg.step = '0.5';
  kg.placeholder = 'kg';
  kg.value = set.weightKg != null ? set.weightKg : '';
  kg.setAttribute('aria-label', 'Carga da série ' + (si + 1));
  kg.addEventListener('input', () => { set.weightKg = numOrNull(kg.value); });

  const warm = document.createElement('button');
  warm.type = 'button';
  warm.className = 'warmup-toggle';
  warm.textContent = 'aq';
  warm.title = 'Marcar como aquecimento (fica fora dos recordes e do volume)';
  warm.setAttribute('aria-pressed', String(!!set.warmup));
  warm.addEventListener('click', () => {
    set.warmup = !set.warmup;
    warm.setAttribute('aria-pressed', String(set.warmup));
    row.classList.toggle('is-warmup', set.warmup);
  });

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'set-remove';
  del.textContent = '×';
  del.setAttribute('aria-label', 'Remover série ' + (si + 1));
  del.addEventListener('click', () => {
    group.sets.splice(si, 1);
    if (!group.sets.length) editor.groups.splice(gi, 1);
    renderGroups();
  });

  row.appendChild(index);
  row.appendChild(reps);
  row.appendChild(kg);
  row.appendChild(warm);
  row.appendChild(del);
  return row;
}

async function saveEditor() {
  const date = $('#f-date').value;
  if (!date) return toast('Falta a data.');

  const session = {
    id: editor.id,
    date: date,
    durationMin: numOrNull($('#f-duration').value),
    calories: numOrNull($('#f-calories').value),
    avgHr: numOrNull($('#f-avghr').value),
    notes: $('#f-notes').value.trim(),
    source: 'manual',    // campo preparado para quando houver importação Garmin
    externalId: null,
    updatedAt: new Date().toISOString()
  };

  const sets = [];
  let order = 0;
  editor.groups.forEach((group) => {
    group.sets.forEach((s) => {
      // Séries em branco são ignoradas em vez de gravadas a zeros.
      if (s.reps == null && s.weightKg == null) return;
      sets.push({
        id: DB.uid(),
        sessionId: session.id,
        exerciseId: group.exerciseId,
        pctPr: group.pctPr != null ? group.pctPr : null,
        order: order++,
        reps: s.reps != null ? s.reps : 0,
        weightKg: s.weightKg != null ? s.weightKg : 0,
        warmup: !!s.warmup
      });
    });
  });

  const wods = [];
  const wodName = $('#f-wod-name').value.trim();
  const wodDesc = $('#f-wod-desc').value.trim();
  const hasMovements = wodMovements.some((m) => m.exerciseId || m.reps || m.weightKg != null);
  if (wodName || wodDesc || hasMovements) {
    const format = $('#f-wod-format').value;
    const isAmrap = (format === 'amrap');
    const outcome = computeWodOutcome();
    const capped = !isAmrap && outcome.capped;

    wods.push({
      id: DB.uid(),
      sessionId: session.id,
      name: wodName,
      format: format,
      timeSec: isAmrap ? null : outcome.timeSec,
      capMin: outcome.capMin,
      finished: isAmrap ? true : !capped,
      repsDone: capped ? numOrNull($('#f-wod-repsdone').value) : null,
      rounds: isAmrap ? numOrNull($('#f-wod-rounds').value) : null,
      extraReps: isAmrap ? numOrNull($('#f-wod-extra').value) : null,
      movements: wodMovements
        .filter((m) => m.exerciseId || m.reps || m.weightKg != null)
        .map((m) => ({
          exerciseId: m.exerciseId || null,
          reps: (m.reps || '').trim() || null,
          weightKg: m.weightKg != null ? m.weightKg : null
        })),
      scaling: wodScaling,
      description: wodDesc
    });
  }

  if (!sets.length && !wods.length && session.durationMin == null) {
    return toast('Sessão vazia. Preenche pelo menos a duração.');
  }

  await DB.saveSession(session, sets, wods);
  await renderSessionList();
  editor = null;
  switchTab('treino');
  toast('Sessão guardada');
}

async function removeSession() {
  if (!confirm('Apagar esta sessão e tudo o que tem dentro?')) return;
  await DB.deleteSession(editor.id);
  await renderSessionList();
  editor = null;
  switchTab('treino');
  toast('Sessão apagada');
}

/* ---------- Plano alimentar ---------- */

let dietMonth = null;   // { year, month } do mês visível na grelha
let dietMap = {};       // 'YYYY-MM-DD' -> true/false

const MONTH_NAMES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

async function loadDiet() {
  const rows = await DB.getDietDays();
  dietMap = {};
  rows.forEach((r) => { dietMap[r.date] = !!r.ok; });
}

async function renderDietGrid() {
  if (!dietMonth) {
    const now = new Date();
    dietMonth = { year: now.getFullYear(), month: now.getMonth() };
  }

  const { year, month } = dietMonth;
  $('#diet-month').textContent = MONTH_NAMES_PT[month] + ' ' + year;

  // Não deixa navegar para o futuro: marcar amanhã não faz sentido.
  const now = new Date();
  $('#diet-next').disabled =
    (year > now.getFullYear()) ||
    (year === now.getFullYear() && month >= now.getMonth());

  const grid = $('#diet-grid');
  grid.innerHTML = '';

  ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].forEach((d) => {
    const head = document.createElement('span');
    head.className = 'diet-head';
    head.textContent = d;
    grid.appendChild(head);
  });

  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;   // segunda = 0
  for (let i = 0; i < offset; i++) {
    grid.appendChild(document.createElement('span'));
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = todayISO();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'diet-cell';
    cell.textContent = day;

    const state = dietMap[date];
    if (state === true) cell.classList.add('yes');
    else if (state === false) cell.classList.add('no');
    if (date === todayStr) cell.classList.add('today');

    if (date > todayStr) {
      cell.disabled = true;
    } else {
      cell.addEventListener('click', () => toggleDietDay(date));
    }

    cell.setAttribute('aria-label', date + ': ' +
      (state === true ? 'cumpri' : state === false ? 'não cumpri' : 'por marcar'));
    grid.appendChild(cell);
  }

  renderDietTiles();
}

/* Três estados em ciclo. "Por marcar" é preciso: um dia que te esqueceste
 * de registar não é o mesmo que um dia em que falhaste o plano. */
async function toggleDietDay(date) {
  const current = dietMap[date];
  if (current === undefined) {
    await DB.setDietDay(date, true);
    dietMap[date] = true;
  } else if (current === true) {
    await DB.setDietDay(date, false);
    dietMap[date] = false;
  } else {
    await DB.deleteDietDay(date);
    delete dietMap[date];
  }
  renderDietGrid();
}

function renderDietTiles() {
  const { year, month } = dietMonth;
  const prefix = year + '-' + String(month + 1).padStart(2, '0');
  const todayStr = todayISO();

  const marked = Object.keys(dietMap).filter((d) => d.indexOf(prefix) === 0);
  const done = marked.filter((d) => dietMap[d] === true);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const elapsed = (prefix === todayStr.slice(0, 7))
    ? Number(todayStr.slice(8, 10))
    : daysInMonth;
  const unmarked = Math.max(0, elapsed - marked.length);

  // Sequência de dias cumpridos a contar de hoje para trás. Um dia por
  // marcar interrompe: não se presume o que não se registou.
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 400; i++) {
    const key = isoOf(cursor);
    if (dietMap[key] === true) streak++;
    else if (i > 0 || dietMap[key] === false) break;
    cursor.setDate(cursor.getDate() - 1);
  }

  const pct = marked.length ? Math.round((done.length / marked.length) * 100) : 0;

  const host = $('#diet-tiles');
  host.innerHTML = '';
  [
    ['Cumpridos', done.length + '/' + marked.length, 'dias marcados'],
    ['Taxa', pct + '%', 'dos marcados'],
    ['Sequência', String(streak), streak === 1 ? 'dia' : 'dias'],
    ['Por marcar', String(unmarked), 'neste mês']
  ].forEach(([label, value, unit]) => {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.innerHTML =
      '<span class="tile-label">' + label + '</span>' +
      '<span class="tile-value">' + escapeHtml(value) + '</span>' +
      '<span class="tile-unit">' + escapeHtml(unit) + '</span>';
    host.appendChild(tile);
  });
}

/* Relação semanal entre adesão e peso.
 * Deliberadamente sem coeficientes de correlação nem linhas de tendência:
 * com uma pesagem por semana, a variação é dominada por hidratação e
 * glicogénio, e qualquer estatística a esta escala seria inventada. */
function renderDietAnalysis(body) {
  const tbody = $('#diet-table').querySelector('tbody');
  tbody.innerHTML = '';
  $('#diet-groups').innerHTML = '';

  const weights = body.filter((b) => b.weightKg != null);
  const dates = Object.keys(dietMap);

  if (!dates.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="table-empty">Marca dias no separador Corpo.</td></tr>';
    $('#diet-hint').textContent = '';
    return;
  }

  const byWeek = {};
  dates.forEach((d) => {
    const k = weekKey(d);
    if (!byWeek[k]) byWeek[k] = { done: 0, marked: 0, weight: null };
    byWeek[k].marked++;
    if (dietMap[d]) byWeek[k].done++;
  });

  // Peso da semana: a última pesagem dessa semana.
  weights.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((w) => {
    const k = weekKey(w.date);
    if (!byWeek[k]) byWeek[k] = { done: 0, marked: 0, weight: null };
    byWeek[k].weight = w.weightKg;
  });

  const keys = Object.keys(byWeek).sort();
  let previousWeight = null;
  const rows = keys.map((k) => {
    const w = byWeek[k];
    let delta = null;
    if (w.weight != null && previousWeight != null) delta = w.weight - previousWeight;
    if (w.weight != null) previousWeight = w.weight;
    return { key: k, done: w.done, marked: w.marked, weight: w.weight, delta: delta };
  });

  rows.slice().reverse().slice(0, 16).forEach((r) => {
    const tr = document.createElement('tr');
    const deltaTxt = r.delta == null ? '—'
      : (r.delta > 0 ? '+' : r.delta < 0 ? '−' : '±') + Math.abs(r.delta).toFixed(1);
    const cls = r.delta == null ? 'trend-flat' : r.delta < 0 ? 'trend-up' : r.delta > 0 ? 'trend-down' : 'trend-flat';
    tr.innerHTML =
      '<td>' + r.key.slice(5) + ' <span class="muted">' + r.key.slice(2, 4) + '</span></td>' +
      '<td>' + r.done + '/' + r.marked + '</td>' +
      '<td>' + (r.weight != null ? r.weight.toFixed(1) : '—') + '</td>' +
      '<td class="' + cls + '">' + deltaTxt + '</td>';
    tbody.appendChild(tr);
  });

  // Comparação por grupos, só quando há semanas suficientes para não
  // ser uma média de dois casos.
  const usable = rows.filter((r) => r.delta != null && r.marked >= 4);
  if (usable.length >= 8) {
    const high = usable.filter((r) => r.done >= 6);
    const low = usable.filter((r) => r.done <= 4);
    const mean = (arr) => arr.reduce((a, r) => a + r.delta, 0) / arr.length;

    if (high.length >= 3 && low.length >= 3) {
      const host = $('#diet-groups');
      fillRows(host, [
        ['Semanas com 6–7 dias', (mean(high) >= 0 ? '+' : '−') + Math.abs(mean(high)).toFixed(2) + ' kg',
          high.length + (high.length === 1 ? ' semana' : ' semanas')],
        ['Semanas com 4 ou menos', (mean(low) >= 0 ? '+' : '−') + Math.abs(mean(low)).toFixed(2) + ' kg',
          low.length + (low.length === 1 ? ' semana' : ' semanas')]
      ]);
      $('#diet-hint').textContent =
        'Variação média do peso por grupo de semanas. São médias de poucos casos, ' +
        'não uma relação de causa e efeito: o peso semanal mexe com hidratação, ' +
        'sal e glicogénio muito mais do que com uma semana de plano.';
      return;
    }
  }

  $('#diet-hint').textContent =
    'A comparação entre semanas cumpridas e não cumpridas aparece a partir de ' +
    '8 semanas com marcações e pesagem. Com menos, qualquer padrão seria ruído. ' +
    'Tens ' + usable.length + (usable.length === 1 ? ' semana utilizável' : ' semanas utilizáveis') + '.';
}

/* ---------- Corpo ---------- */

async function renderBodyList() {
  const rows = await DB.getBodyMetrics();
  const list = $('#body-list');
  list.innerHTML = '';
  $('#empty-body').hidden = rows.length > 0;

  rows.forEach((row, i) => {
    const card = document.createElement('button');
    card.className = 'card';
    card.type = 'button';
    card.addEventListener('click', () => openBodyEditor(row.date));

    card.appendChild(buildRail(row.date));

    const main = document.createElement('div');
    main.className = 'card-main';

    if (row.weightKg != null) {
      const w = document.createElement('div');
      w.className = 'body-weight';
      w.innerHTML = '<b>' + row.weightKg.toFixed(1) + '</b> kg';

      // Diferença para a medição anterior (a lista vem da mais recente para a mais antiga)
      const prev = rows[i + 1];
      if (prev && prev.weightKg != null) {
        const delta = row.weightKg - prev.weightKg;
        const span = document.createElement('span');
        span.className = 'delta';
        span.textContent = (delta > 0 ? '+' : delta < 0 ? '−' : '±') + Math.abs(delta).toFixed(1);
        w.appendChild(span);
      }
      main.appendChild(w);
    }

    const bits = [];
    if (row.bodyFatPct != null) bits.push(row.bodyFatPct.toFixed(1) + '% MG');
    Object.keys(MEASURE_LABELS).forEach((k) => {
      const v = row.measures ? row.measures[k] : null;
      if (v != null) bits.push(MEASURE_LABELS[k] + ' ' + v);
    });
    if (bits.length) {
      const el = document.createElement('div');
      el.className = 'card-metrics';
      bits.forEach((t) => {
        const span = document.createElement('span');
        span.textContent = t;
        el.appendChild(span);
      });
      main.appendChild(el);
    }

    card.appendChild(main);
    list.appendChild(card);
  });
}

async function openBodyEditor(dateISO) {
  const existing = dateISO ? await DB.getBodyMetric(dateISO) : null;
  const all = await DB.getBodyMetrics();
  const last = all[0] || null;

  bodyEditor = { originalDate: existing ? existing.date : null };

  $('#body-editor-title').textContent = existing ? 'Editar medição' : 'Nova medição';
  $('#btn-body-delete').hidden = !existing;
  $('#b-date').value = existing ? existing.date : lastFridayISO();

  const m = existing ? (existing.measures || {}) : {};
  $('#b-weight').value = existing && existing.weightKg != null ? existing.weightKg : '';
  $('#b-bodyfat').value = existing && existing.bodyFatPct != null ? existing.bodyFatPct : '';
  $('#b-notes').value = existing ? (existing.notes || '') : '';

  Object.keys(MEASURE_LABELS).forEach((k) => {
    $('#b-' + k).value = m[k] != null ? m[k] : '';
    // Numa medição nova, o valor anterior aparece como sugestão em cinzento:
    // só se escreve o que mudou, em vez de copiar seis números à mão.
    if (!existing && last) {
      const prev = last.measures ? last.measures[k] : null;
      $('#b-' + k).placeholder = prev != null ? String(prev) : '—';
    } else {
      $('#b-' + k).placeholder = '—';
    }
  });
  if (!existing && last && last.weightKg != null) {
    $('#b-weight').placeholder = String(last.weightKg);
  }

  showOnly('#view-body-editor');
}

async function saveBodyEditor() {
  const date = $('#b-date').value;
  if (!date) return toast('Falta a data.');

  const measures = {};
  let anyMeasure = false;
  Object.keys(MEASURE_LABELS).forEach((k) => {
    const v = numOrNull($('#b-' + k).value);
    if (v != null) { measures[k] = v; anyMeasure = true; }
  });

  const weight = numOrNull($('#b-weight').value);
  const bodyFat = numOrNull($('#b-bodyfat').value);

  if (weight == null && bodyFat == null && !anyMeasure) {
    return toast('Preenche pelo menos o peso.');
  }

  // Se a data mudou, o registo antigo tem de sair: a data é a chave primária.
  if (bodyEditor.originalDate && bodyEditor.originalDate !== date) {
    await DB.deleteBodyMetric(bodyEditor.originalDate);
  }

  await DB.saveBodyMetric({
    date: date,
    weightKg: weight,
    bodyFatPct: bodyFat,
    measures: measures,
    notes: $('#b-notes').value.trim(),
    updatedAt: new Date().toISOString()
  });

  await renderBodyList();
  bodyEditor = null;
  switchTab('corpo');
  toast('Medição guardada');
}

async function removeBodyMetric() {
  if (!confirm('Apagar esta medição?')) return;
  await DB.deleteBodyMetric(bodyEditor.originalDate);
  await renderBodyList();
  bodyEditor = null;
  switchTab('corpo');
  toast('Medição apagada');
}

/* ---------- Evolução ---------- */

/* Fórmula de Epley: converte qualquer série numa carga máxima teórica de
 * uma repetição, para 5×100 e 3×110 ficarem na mesma escala. */
function epley(weightKg, reps) {
  if (!weightKg || !reps) return 0;
  return weightKg * (1 + reps / 30);
}

let weeklyTarget = 5;        // alvo de sessões por semana, editável em Definições
let currentLens = 'sessoes';
let currentPeriodDays = 0;   // 0 = todos os treinos registados

/* Só recalcula a lente visível: os gráficos das outras não estão no ecrã
 * e recalcular tudo a cada troca era trabalho deitado fora. */
async function renderEvolution() {
  document.querySelectorAll('[data-lens-panel]').forEach((p) => {
    p.hidden = p.dataset.lensPanel !== currentLens;
  });
  document.querySelectorAll('#lens-picker .seg').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.lens === currentLens);
  });

  if (currentLens === 'sessoes') {
    const sessions = await DB.getSessions();
    await loadHrProfile();
    renderSessionsLens(sessions);
    return;
  }

  if (currentLens === 'forca') {
    const [sessions, allSets] = await Promise.all([
      DB.getSessions(), DB.getAllSets()
    ]);
    const dateBySession = {};
    const intentBySession = {};
    sessions.forEach((s) => {
      dateBySession[s.id] = s.date;
      intentBySession[s.id] = s.intent || '';
    });
    renderStrengthSection(allSets, dateBySession, intentBySession);
    renderVolumeSection(allSets, dateBySession);
    return;
  }

  if (currentLens === 'wod') {
    const [sessions, allWods] = await Promise.all([
      DB.getSessions(), DB.getAllWods()
    ]);
    const dateBySession = {};
    const sessionById = {};
    sessions.forEach((s) => {
      dateBySession[s.id] = s.date;
      sessionById[s.id] = s;
    });
    await loadHrProfile();
    renderWodSection(allWods, dateBySession, sessionById);
    return;
  }

  const [body, sessionsForBmr] = await Promise.all([
    DB.getBodyMetrics(), DB.getSessions()
  ]);
  renderWeightSection(body);
  renderMeasureSection(body);
  renderDietAnalysis(body);
  await renderMetabolism(body, sessionsForBmr);
}

/* ---------- Lente: sessões ---------- */

function renderSessionsLens(allSessions) {
  $('#period-select').value = String(currentPeriodDays);

  // Ordem crescente: os gráficos leem-se da esquerda para a direita.
  const inPeriod = filterByPeriod(allSessions, currentPeriodDays)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  renderSessionTiles(allSessions, inPeriod);
  renderConsistency(allSessions, inPeriod);
  renderRestRows(inPeriod);
  renderPerWeekChart(inPeriod);
  renderWeekdayChart(inPeriod);

  renderMetricChart('#chart-duration', inPeriod, 'durationMin',
    (v) => Math.round(v) + ' min', 'var(--load)');

  renderMonthTable(allSessions);
}

/* ---------- Consistência e descanso ---------- */

function renderConsistency(allSessions, inPeriod) {
  const target = weeklyTarget;

  // Dias distintos com treino: duas sessões no mesmo dia contam como um dia.
  const days = {};
  allSessions.forEach((s) => { days[s.date] = (days[s.date] || 0) + 1; });
  Chart.heatmap($('#heatmap-host'), days, { weeks: 53 });

  const byWeek = {};
  allSessions.forEach((s) => {
    const k = weekKey(s.date);
    byWeek[k] = (byWeek[k] || 0) + 1;
  });

  const weeks = Object.keys(byWeek).sort();
  const thisWeek = weekKey(todayISO());

  // Sequência: a semana em curso não conta como falhada, porque ainda não
  // acabou. Contá-la punia-te por consultares a app a uma segunda-feira.
  let current = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i] === thisWeek) continue;
    if (byWeek[weeks[i]] >= target) current++;
    else break;
  }

  let best = 0;
  let run = 0;
  weeks.forEach((w) => {
    if (byWeek[w] >= target) { run++; best = Math.max(best, run); }
    else run = 0;
  });

  const weeksAtTarget = weeks.filter((w) => byWeek[w] >= target).length;
  const pct = weeks.length ? Math.round((weeksAtTarget / weeks.length) * 100) : 0;

  const host = $('#consistency-tiles');
  host.innerHTML = '';
  [
    ['Alvo', String(target), 'por semana'],
    ['Sequência', String(current), current === 1 ? 'semana' : 'semanas'],
    ['Melhor', String(best), best === 1 ? 'semana' : 'semanas'],
    ['Semanas no alvo', pct + '%', 'do histórico']
  ].forEach(([label, value, unit]) => {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.innerHTML =
      '<span class="tile-label">' + label + '</span>' +
      '<span class="tile-value">' + escapeHtml(value) + '</span>' +
      '<span class="tile-unit">' + escapeHtml(unit) + '</span>';
    host.appendChild(tile);
  });
}

function renderRestRows(inPeriod) {
  const host = $('#rest-rows');
  host.innerHTML = '';

  const dates = Array.from(new Set(inPeriod.map((s) => s.date))).sort();
  if (dates.length < 2) {
    host.innerHTML = '<p class="chart-empty">Poucos treinos no período para analisar descanso.</p>';
    return;
  }

  const gaps = [];
  for (let i = 1; i < dates.length; i++) {
    const a = new Date(dates[i - 1] + 'T00:00:00');
    const b = new Date(dates[i] + 'T00:00:00');
    gaps.push(Math.round((b - a) / 86400000));
  }

  const avgGap = gaps.reduce((x, y) => x + y, 0) / gaps.length;

  // Séries de dias consecutivos: um intervalo de 1 dia significa treinar
  // no dia seguinte, ou seja, sem descanso pelo meio.
  let run = 1;
  let longest = 1;
  let longRuns = 0;
  gaps.forEach((g) => {
    if (g === 1) {
      run++;
      longest = Math.max(longest, run);
      if (run === 4) longRuns++;   // conta cada série de 4+ uma só vez
    } else {
      run = 1;
    }
  });

  const fullRestDays = gaps.filter((g) => g >= 2).length;

  fillRows(host, [
    ['Intervalo médio', avgGap.toFixed(1) + ' dias', 'entre treinos'],
    ['Máximo seguido', longest + (longest === 1 ? ' dia' : ' dias'), 'sem descanso'],
    ['Blocos de 4+ dias', String(longRuns), longRuns === 1 ? 'ocorrência' : 'ocorrências'],
    ['Pausas de 2+ dias', String(fullRestDays), 'no período']
  ]);

  if (longRuns > 0) {
    const note = document.createElement('p');
    note.className = 'flag';
    note.textContent = 'Fizeste ' + longRuns + (longRuns === 1 ? ' bloco' : ' blocos') +
      ' de 4 ou mais dias seguidos. Vale a pena olhar para isso se andas a sentir-te estagnado ou dorido.';
    host.appendChild(note);
  }
}

function fillRows(host, rows) {
  rows.forEach(([label, value, unit]) => {
    const row = document.createElement('div');
    row.className = 'pr-row';
    row.innerHTML =
      '<span class="pr-label">' + escapeHtml(label) + '</span>' +
      '<span class="pr-value">' + escapeHtml(value) + '</span>' +
      '<span class="pr-date">' + escapeHtml(unit) + '</span>';
    host.appendChild(row);
  });
}

/* ---------- Metabolismo ---------- */

/* Mifflin-St Jeor: a fórmula mais usada para estimar o metabolismo basal.
 * É uma estimativa estatística, não uma medição — erra facilmente 10%. */
function mifflinStJeor(weightKg, heightCm, age, sex) {
  const base = (10 * weightKg) + (6.25 * heightCm) - (5 * age);
  return sex === 'f' ? base - 161 : base + 5;
}

async function renderMetabolism(body, sessions) {
  const host = $('#bmr-tiles');
  host.innerHTML = '';

  const heightCm = Number(await DB.getSetting('heightCm', 0));
  const birthYear = Number(await DB.getSetting('birthYear', 0));
  const sex = await DB.getSetting('sex', '');
  const latest = body.filter((b) => b.weightKg != null)[0];

  if (!heightCm || !birthYear || !sex || !latest) {
    $('#bmr-hint').textContent =
      'Preenche a altura, o ano de nascimento e o sexo em Definições, e regista ' +
      'pelo menos uma pesagem. Sem os quatro valores não há cálculo possível.';
    host.innerHTML = '<p class="chart-empty">Faltam dados.</p>';
    return;
  }

  const age = new Date().getFullYear() - birthYear;
  const bmr = mifflinStJeor(latest.weightKg, heightCm, age, sex);

  // O multiplicador sai da tua frequência real dos últimos 90 dias, em vez
  // de te perguntar o "nível de atividade", que toda a gente sobrestima.
  const recent = filterByPeriod(sessions, 90);
  const perWeek = recent.length / (90 / 7);
  let factor = 1.2;
  let factorLabel = 'sedentário';
  if (perWeek >= 6.5) { factor = 1.9; factorLabel = 'muito intenso'; }
  else if (perWeek >= 5) { factor = 1.725; factorLabel = 'intenso'; }
  else if (perWeek >= 3) { factor = 1.55; factorLabel = 'moderado'; }
  else if (perWeek >= 1) { factor = 1.375; factorLabel = 'ligeiro'; }

  const tdee = bmr * factor;

  [
    ['Basal', Math.round(bmr).toLocaleString('pt-PT'), 'kcal/dia'],
    ['Manutenção', Math.round(tdee).toLocaleString('pt-PT'), 'kcal/dia'],
    ['Atividade', factor.toFixed(3).replace(/0+$/, ''), factorLabel],
    ['Base', latest.weightKg.toFixed(1) + ' kg', prettyDate(latest.date)]
  ].forEach(([label, value, unit]) => {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.innerHTML =
      '<span class="tile-label">' + label + '</span>' +
      '<span class="tile-value">' + escapeHtml(value) + '</span>' +
      '<span class="tile-unit">' + escapeHtml(unit) + '</span>';
    host.appendChild(tile);
  });

  $('#bmr-hint').textContent =
    'Basal é o que o corpo gasta em repouso absoluto; manutenção é a estimativa ' +
    'com a tua frequência real de treino (' + perWeek.toFixed(1) + ' sessões/semana ' +
    'nos últimos 90 dias). São fórmulas estatísticas, não medições: contam com ' +
    'um erro de cerca de 10% para cada lado, e não substituem aconselhamento ' +
    'de um nutricionista.';
}

/* days = 0 significa "tudo". */
function filterByPeriod(sessions, days) {
  if (!days) return sessions;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffISO = isoOf(cutoff);
  return sessions.filter((s) => s.date >= cutoffISO);
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function renderSessionTiles(allSessions, inPeriod) {
  const host = $('#session-tiles');
  host.innerHTML = '';

  const durations = inPeriod.filter((s) => s.durationMin).map((s) => s.durationMin);
  const calories = inPeriod.filter((s) => s.calories).map((s) => s.calories);
  const hrs = inPeriod.filter((s) => s.avgHr).map((s) => s.avgHr);

  // Semanas cobertas pelo período, para a média por semana não mentir
  // quando ainda há pouco histórico.
  let weeks;
  if (currentPeriodDays) {
    weeks = currentPeriodDays / 7;
  } else if (allSessions.length) {
    // Sem filtro, a base é o teu histórico todo, da primeira sessão até hoje.
    const first = new Date(allSessions[allSessions.length - 1].date + 'T00:00:00');
    weeks = Math.max(1, (Date.now() - first.getTime()) / (7 * 86400000));
  } else {
    weeks = 1;
  }

  // Intensidade: calorias por minuto, só nas sessões que têm os dois campos.
  const withBoth = inPeriod.filter((s) => s.calories && s.durationMin);
  const kcalMin = withBoth.length
    ? average(withBoth.map((s) => s.calories / s.durationMin))
    : null;

  const withHr = inPeriod.filter((s) => s.avgHr);
  const avgPct = (withHr.length && hrProfile.maxHr)
    ? average(withHr.map((s) => (s.avgHr / hrProfile.maxHr) * 100))
    : null;

  let sinceLast = null;
  if (allSessions.length) {
    const lastDate = new Date(allSessions[0].date + 'T00:00:00');
    sinceLast = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
  }

  const tiles = [
    ['Sessões', String(inPeriod.length), 'no período'],
    ['Por semana', (inPeriod.length / weeks).toFixed(1), 'média'],
    ['Duração', durations.length ? Math.round(average(durations)) : '—', 'min em média'],
    ['Calorias', calories.length ? Math.round(average(calories)) : '—', 'kcal em média'],
    ['FC média', hrs.length ? Math.round(average(hrs)) : '—', avgPct != null ? Math.round(avgPct) + '% da máx' : 'bpm'],
    ['Intensidade', kcalMin != null ? kcalMin.toFixed(1) : '—', 'kcal/min'],
    ['Último treino', sinceLast == null ? '—' : (sinceLast === 0 ? 'hoje' : sinceLast), sinceLast > 0 ? 'dias atrás' : '']
  ];

  tiles.forEach(([label, value, unit]) => {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.innerHTML =
      '<span class="tile-label">' + label + '</span>' +
      '<span class="tile-value">' + escapeHtml(String(value)) + '</span>' +
      '<span class="tile-unit">' + escapeHtml(unit) + '</span>';
    host.appendChild(tile);
  });
}

function renderPerWeekChart(inPeriod) {
  const byWeek = {};
  inPeriod.forEach((s) => {
    const k = weekKey(s.date);
    byWeek[k] = (byWeek[k] || 0) + 1;
  });

  // Preenche as semanas sem treino: um buraco no gráfico diz mais
  // do que duas barras encostadas a fingir continuidade.
  const keys = Object.keys(byWeek).sort();
  const bars = [];
  if (keys.length) {
    const all = weekRange(inPeriod[0].date, inPeriod[inPeriod.length - 1].date);
    all.forEach((k) => bars.push({ label: k.slice(5), value: byWeek[k] || 0 }));
  }

  Chart.bar($('#chart-perweek'), bars.slice(-26), {
    format: (v) => v.toFixed(0) + ' treinos',
    target: weeklyTarget
  });
}

/* Todas as chaves de semana entre duas datas, inclusive. */
function weekRange(startISO, endISO) {
  const out = [];
  const d = new Date(startISO + 'T00:00:00');
  const end = new Date(endISO + 'T00:00:00');
  const seen = {};
  while (d <= end) {
    const k = weekKey(isoOf(d));
    if (!seen[k]) { seen[k] = true; out.push(k); }
    d.setDate(d.getDate() + 7);
  }
  const lastK = weekKey(endISO);
  if (!seen[lastK]) out.push(lastK);
  return out;
}

function renderWeekdayChart(inPeriod) {
  const names = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  inPeriod.forEach((s) => {
    const d = new Date(s.date + 'T00:00:00');
    counts[(d.getDay() + 6) % 7] += 1;   // segunda = 0
  });

  const bars = names.map((n, i) => ({ label: n, value: counts[i] }));
  Chart.bar($('#chart-weekday'), bars, { format: (v) => v.toFixed(0) + ' treinos', allLabels: true });
}

function renderMetricChart(selector, inPeriod, field, format, color) {
  const points = inPeriod
    .filter((s) => s[field] != null && s[field] > 0)
    .map((s) => ({ x: s.date, y: s[field] }));
  Chart.line($(selector), points, { format: format, color: color });
}

function renderMonthTable(allSessions) {
  const byMonth = {};
  allSessions.forEach((s) => {
    const key = s.date.slice(0, 7);
    if (!byMonth[key]) byMonth[key] = { n: 0, dur: [], cal: [], hr: [] };
    byMonth[key].n += 1;
    if (s.durationMin) byMonth[key].dur.push(s.durationMin);
    if (s.calories) byMonth[key].cal.push(s.calories);
    if (s.avgHr) byMonth[key].hr.push(s.avgHr);
  });

  const tbody = $('#month-table').querySelector('tbody');
  tbody.innerHTML = '';

  const keys = Object.keys(byMonth).sort().reverse().slice(0, 12);
  if (!keys.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Sem sessões registadas.</td></tr>';
    return;
  }

  keys.forEach((key) => {
    const m = byMonth[key];
    const [y, mm] = key.split('-');
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + MONTHS_PT[Number(mm) - 1] + ' ' + y.slice(2) + '</td>' +
      '<td>' + m.n + '</td>' +
      '<td>' + (m.dur.length ? Math.round(average(m.dur)) : '—') + '</td>' +
      '<td>' + (m.cal.length ? Math.round(average(m.cal)) : '—') + '</td>' +
      '<td>' + (m.hr.length ? Math.round(average(m.hr)) : '—') + '</td>';
    tbody.appendChild(tr);
  });
}

function renderStrengthSection(allSets, dateBySession, intentBySession) {
  const select = $('#ev-exercise');

  // Basta haver repetições; o tipo de gráfico decide-se por movimento.
  const working = allSets.filter((s) => !s.warmup && s.reps > 0);

  renderLiftsTable(working, dateBySession);

  const used = {};
  working.forEach((s) => { used[s.exerciseId] = true; });
  const ids = Object.keys(used).sort((a, b) => exerciseName(a).localeCompare(exerciseName(b), 'en'));

  const previous = select.value;
  select.innerHTML = '';
  ids.forEach((id) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = exerciseName(id);
    select.appendChild(opt);
  });
  if (ids.indexOf(previous) >= 0) select.value = previous;

  if (!ids.length) {
    select.hidden = true;
    $('#chart-strength').innerHTML = '<p class="chart-empty">Regista séries de força para ver a evolução.</p>';
    $('#strength-prs').innerHTML = '';
    $('#band-rows').innerHTML = '';
    $('#intent-legend').innerHTML = '';
    $('#strength-hint').textContent = '';
    return;
  }
  select.hidden = false;

  const chosen = select.value || ids[0];
  const mine = working.filter((s) => s.exerciseId === chosen);
  const loaded = mine.filter((s) => s.weightKg > 0);

  if (!loaded.length) {
    renderBodyweightProgress(mine, dateBySession, intentBySession);
  } else {
    renderLoadedProgress(loaded, mine.length - loaded.length, dateBySession, intentBySession);
  }
}

/* Resume cada sessão de um movimento numa linha: a série mais pesada,
 * o 1RM que ela estima, e a intenção com que a sessão foi marcada. */
function summariseByDate(sets, dateBySession, intentBySession, useReps) {
  const byDate = {};
  sets.forEach((s) => {
    const date = dateBySession[s.sessionId];
    if (!date) return;
    const score = useReps ? s.reps : epley(s.weightKg, s.reps);
    if (!byDate[date] || score > byDate[date].score) {
      byDate[date] = {
        date: date,
        score: score,
        set: s,
        pctPr: s.pctPr != null ? s.pctPr : null,
        legacyIntent: intentBySession[s.sessionId] || ''
      };
    }
  });

  const entries = Object.keys(byDate).sort().map((d) => byDate[d]);

  // Percentagem em falta: calcula-se pela carga contra o melhor registo
  // até àquela data. Usar o PR actual reclassificaria o passado todo
  // sempre que batesses um recorde novo.
  let best = 0;
  entries.forEach((e) => {
    if (e.pctPr == null && best > 0 && !useReps) {
      e.pctPr = (e.set.weightKg / best) * 100;
      e.pctAuto = true;
    }
    e.band = bandFromPct(e.pctPr) || e.legacyIntent || '';
    best = Math.max(best, e.score);
  });

  return entries;
}

/* Recorde acumulado até cada data. Serve de referência no gráfico e é o que
 * permite dizer "isto foi um dia leve" em vez de "isto foi uma queda". */
function runningBest(entries) {
  let best = 0;
  return entries.map((e) => {
    best = Math.max(best, e.score);
    return { x: e.date, y: best };
  });
}

/* Tendência dentro de uma faixa: metade recente contra metade antiga.
 * Com menos de 4 sessões não há tendência nenhuma, e dizê-lo é mais honesto
 * do que desenhar uma seta a partir de dois pontos. */
function bandTrend(entries) {
  if (entries.length < 4) return null;
  const half = Math.floor(entries.length / 2);
  const older = entries.slice(0, half);
  const recent = entries.slice(entries.length - half);
  const avg = (arr) => arr.reduce((a, e) => a + e.set.weightKg, 0) / arr.length;
  const a = avg(older);
  const b = avg(recent);
  if (!a) return null;
  return ((b - a) / a) * 100;
}

function trendMark(pct) {
  if (pct == null) return { text: '—', cls: 'flat' };
  if (pct > 2) return { text: '↑ ' + pct.toFixed(0) + '%', cls: 'up' };
  if (pct < -2) return { text: '↓ ' + Math.abs(pct).toFixed(0) + '%', cls: 'down' };
  return { text: '→ estável', cls: 'flat' };
}

/* Movimentos com carga: 1RM estimado, escala em kg. */
function renderLoadedProgress(loaded, ignoredCount, dateBySession, intentBySession) {
  const entries = summariseByDate(loaded, dateBySession, intentBySession, false);

  const points = entries.map((e) => ({
    x: e.date,
    y: e.score,
    color: INTENTS[e.band] ? INTENTS[e.band].color : INTENTS[''].color
  }));

  Chart.line($('#chart-strength'), points, {
    format: (v) => v.toFixed(1) + ' kg',
    pathColor: 'var(--ink-faint)',
    reference: runningBest(entries)
  });

  renderIntentLegend(entries);
  renderBandRows(entries, (e) => e.set.weightKg + ' kg');

  let hint = 'Cada ponto é a melhor série do dia, convertida em 1RM estimado ' +
    '(Epley). A cor vem da percentagem do PR a que trabalhaste; a linha tracejada ' +
    'é o teu recorde acumulado. Um ponto baixo a 55% não é queda, é um dia leve.';
  if (ignoredCount > 0) {
    hint += ' ' + ignoredCount + (ignoredCount === 1 ? ' série sem carga ficou' : ' séries sem carga ficaram') +
      ' de fora.';
  }
  $('#strength-hint').textContent = hint;

  const heaviest = loaded.slice().sort((a, b) => b.weightKg - a.weightKg)[0];
  const bestEpley = loaded.slice().sort((a, b) => epley(b.weightKg, b.reps) - epley(a.weightKg, a.reps))[0];
  const bestVolumeSet = loaded.slice().sort((a, b) => (b.reps * b.weightKg) - (a.reps * a.weightKg))[0];

  fillPrList([
    ['Série mais pesada', heaviest.weightKg + ' kg × ' + heaviest.reps, dateBySession[heaviest.sessionId]],
    ['Melhor 1RM estimado', epley(bestEpley.weightKg, bestEpley.reps).toFixed(1) + ' kg', dateBySession[bestEpley.sessionId]],
    ['Série de maior volume', (bestVolumeSet.reps * bestVolumeSet.weightKg).toFixed(0) + ' kg', dateBySession[bestVolumeSet.sessionId]]
  ]);
}

/* Movimentos de peso corporal: escala em repetições. */
function renderBodyweightProgress(mine, dateBySession, intentBySession) {
  const entries = summariseByDate(mine, dateBySession, intentBySession, true);

  const points = entries.map((e) => ({
    x: e.date,
    y: e.score,
    color: INTENTS[e.band] ? INTENTS[e.band].color : INTENTS[''].color
  }));

  Chart.line($('#chart-strength'), points, {
    format: (v) => Math.round(v) + ' reps',
    pathColor: 'var(--ink-faint)',
    reference: runningBest(entries)
  });

  renderIntentLegend(entries);
  renderBandRows(entries, (e) => e.set.reps + ' reps');

  $('#strength-hint').textContent =
    'Movimento sem carga registada, por isso a escala é em repetições. ' +
    'Se começares a usar colete, regista o peso e passa sozinho para quilos.';

  const byDate = {};
  mine.forEach((s) => {
    const d = dateBySession[s.sessionId];
    if (!d) return;
    if (!byDate[d]) byDate[d] = { total: 0, sets: 0 };
    byDate[d].total += s.reps;
    byDate[d].sets += 1;
  });
  const dates = Object.keys(byDate).sort();
  const bestSet = mine.slice().sort((a, b) => b.reps - a.reps)[0];
  const bestTotal = dates.slice().sort((a, b) => byDate[b].total - byDate[a].total)[0];
  const mostSets = dates.slice().sort((a, b) => byDate[b].sets - byDate[a].sets)[0];

  fillPrList([
    ['Melhor série', bestSet.reps + ' reps', dateBySession[bestSet.sessionId]],
    ['Mais repetições num dia', byDate[bestTotal].total + ' reps', bestTotal],
    ['Mais séries num dia', byDate[mostSets].sets + ' séries', mostSets]
  ]);
}

function renderIntentLegend(entries) {
  const present = {};
  entries.forEach((e) => { present[e.band] = true; });

  const host = $('#intent-legend');
  host.innerHTML = '';
  INTENT_ORDER.filter((k) => present[k]).forEach((k) => {
    const item = document.createElement('span');
    item.className = 'legend-item';
    item.innerHTML = '<i style="background:' + INTENTS[k].color + '"></i>' +
      INTENTS[k].label + (BAND_RANGES[k] && k ? ' <em>' + BAND_RANGES[k] + '</em>' : '');
    host.appendChild(item);
  });
}

/* A leitura de progresso que interessa: dentro de cada faixa, as cargas
 * estão a subir? Comparar um dia leve com um dia pesado nunca diz nada. */
function renderBandRows(entries, formatLoad) {
  const host = $('#band-rows');
  host.innerHTML = '';

  INTENT_ORDER.forEach((key) => {
    const inBand = entries.filter((e) => e.band === key);
    if (!inBand.length) return;

    const avgLoad = inBand.reduce((a, e) => a + e.set.weightKg, 0) / inBand.length;
    const usesLoad = avgLoad > 0;
    const trend = usesLoad ? bandTrend(inBand) : null;
    const mark = trendMark(trend);
    const last = inBand[inBand.length - 1];

    const withPct = inBand.filter((e) => e.pctPr != null);
    const avgPct = withPct.length
      ? withPct.reduce((a, e) => a + e.pctPr, 0) / withPct.length
      : null;

    const row = document.createElement('div');
    row.className = 'pr-row band-row';
    row.innerHTML =
      '<span class="pr-label"><i class="band-dot" style="background:' + INTENTS[key].color + '"></i>' +
        INTENTS[key].label +
        (avgPct != null ? ' · ' + Math.round(avgPct) + '% médio' : '') +
        ' · ' + inBand.length + (inBand.length === 1 ? ' sessão' : ' sessões') + '</span>' +
      '<span class="pr-value">' + (usesLoad ? avgLoad.toFixed(1) + ' kg' : '—') + '</span>' +
      '<span class="pr-date">última ' + escapeHtml(formatLoad(last)) + ' · ' +
        '<b class="trend-' + mark.cls + '">' + mark.text + '</b></span>';
    host.appendChild(row);
  });

  if (host.children.length) {
    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent = 'A faixa vem da percentagem do PR que escreveste em cada ' +
      'exercício; em branco, é calculada pela carga contra o teu melhor registo até ' +
      'à data. Menos de 4 sessões numa faixa não dá tendência fiável.';
    host.appendChild(note);
  }
}

/* Tabela com todos os movimentos de uma vez — responde a "estou a aumentar
 * pesos?" sem percorrer a lista de movimentos um a um. */
function renderLiftsTable(working, dateBySession) {
  const tbody = $('#lifts-table').querySelector('tbody');
  tbody.innerHTML = '';

  const byExercise = {};
  working.forEach((s) => {
    if (!byExercise[s.exerciseId]) byExercise[s.exerciseId] = [];
    byExercise[s.exerciseId].push(s);
  });

  const ids = Object.keys(byExercise);
  if (!ids.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Sem séries registadas.</td></tr>';
    return;
  }

  const rows = ids.map((id) => {
    const sets = byExercise[id];
    const loaded = sets.filter((s) => s.weightKg > 0);
    const useReps = loaded.length === 0;
    const source = useReps ? sets : loaded;

    const byDate = {};
    source.forEach((s) => {
      const d = dateBySession[s.sessionId];
      if (!d) return;
      const score = useReps ? s.reps : epley(s.weightKg, s.reps);
      if (!byDate[d] || score > byDate[d].score) byDate[d] = { score: score, set: s };
    });

    const dates = Object.keys(byDate).sort();
    if (!dates.length) return null;

    const best = Math.max.apply(null, dates.map((d) => byDate[d].score));
    const lastDate = dates[dates.length - 1];
    const lastSet = byDate[lastDate].set;
    const days = Math.floor((Date.now() - new Date(lastDate + 'T00:00:00').getTime()) / 86400000);

    // Três últimas contra as três anteriores: reage a mudanças recentes
    // sem saltar por causa de uma sessão isolada.
    let trend = null;
    if (dates.length >= 4) {
      const scores = dates.map((d) => byDate[d].score);
      const recent = scores.slice(-3);
      const older = scores.slice(Math.max(0, scores.length - 6), scores.length - 3);
      if (older.length) {
        const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
        const o = avg(older);
        if (o) trend = ((avg(recent) - o) / o) * 100;
      }
    }

    return {
      name: exerciseName(id),
      best: useReps ? Math.round(best) + ' reps' : best.toFixed(1),
      last: useReps ? lastSet.reps + ' reps' : lastSet.weightKg + ' kg',
      days: days,
      trend: trend
    };
  }).filter(Boolean);

  // Ordem por recência: o que treinaste ontem no topo, o abandonado no fundo.
  rows.sort((a, b) => a.days - b.days);

  rows.forEach((r) => {
    const mark = trendMark(r.trend);
    const stale = r.days > 30 ? ' class="stale"' : '';
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td' + stale + '>' + escapeHtml(r.name) + '</td>' +
      '<td>' + escapeHtml(r.best) + '</td>' +
      '<td>' + escapeHtml(r.last) + '</td>' +
      '<td>' + (r.days === 0 ? 'hoje' : r.days + 'd') + '</td>' +
      '<td class="trend-' + mark.cls + '">' + mark.text + '</td>';
    tbody.appendChild(tr);
  });
}

function fillPrList(rows) {
  const prs = $('#strength-prs');
  prs.innerHTML = '';
  rows.forEach(([label, value, date]) => {
    const row = document.createElement('div');
    row.className = 'pr-row';
    row.innerHTML = '<span class="pr-label">' + label + '</span>' +
      '<span class="pr-value">' + escapeHtml(value) + '</span>' +
      '<span class="pr-date">' + (date ? prettyDate(date) : '') + '</span>';
    prs.appendChild(row);
  });
}

function renderWeightSection(body) {
  const points = body
    .filter((b) => b.weightKg != null)
    .map((b) => ({ x: b.date, y: b.weightKg }))
    .sort((a, b) => a.x.localeCompare(b.x));
  Chart.line($('#chart-weight'), points, { format: (v) => v.toFixed(1) + ' kg' });
}

function renderMeasureSection(body) {
  const key = $('#ev-measure').value;
  const points = body
    .filter((b) => b.measures && b.measures[key] != null)
    .map((b) => ({ x: b.date, y: b.measures[key] }))
    .sort((a, b) => a.x.localeCompare(b.x));
  Chart.line($('#chart-measure'), points, { format: (v) => v.toFixed(1) + ' cm' });
}

function renderVolumeSection(allSets, dateBySession) {
  const byWeek = {};
  allSets.filter((s) => !s.warmup).forEach((s) => {
    const date = dateBySession[s.sessionId];
    if (!date) return;
    const key = weekKey(date);
    byWeek[key] = (byWeek[key] || 0) + (s.reps * s.weightKg);
  });

  const bars = Object.keys(byWeek).sort().slice(-12).map((k) => ({
    label: k.slice(5),          // "S23" em vez de "2026-S23"
    value: byWeek[k]
  }));

  Chart.bar($('#chart-volume'), bars, {
    format: (v) => Math.round(v).toLocaleString('pt-PT') + ' kg'
  });
}

/* Perfil cardíaco, lido uma vez e guardado para os cálculos de intensidade. */
let hrProfile = { maxHr: null, restHr: null, estimated: false };

async function loadHrProfile() {
  const maxHr = Number(await DB.getSetting('maxHr', 0)) || null;
  const restHr = Number(await DB.getSetting('restingHr', 0)) || null;
  const birthYear = Number(await DB.getSetting('birthYear', 0));

  // Tanaka: 208 − 0,7 × idade. Mais fiável que o velho 220 − idade, mas
  // continua a ser média populacional — o valor do Garmin é melhor.
  let estimated = false;
  let effectiveMax = maxHr;
  if (!effectiveMax && birthYear) {
    effectiveMax = Math.round(208 - 0.7 * (new Date().getFullYear() - birthYear));
    estimated = true;
  }

  hrProfile = { maxHr: effectiveMax, restHr: restHr, estimated: estimated };
  return hrProfile;
}

/* Percentagem da FC máxima. */
function pctMaxHr(avgHr) {
  if (!avgHr || !hrProfile.maxHr) return null;
  return (avgHr / hrProfile.maxHr) * 100;
}

/* Percentagem da reserva cardíaca (Karvonen). Descontar a FC de repouso
 * separa melhor sessões duras de sessões mornas do que a % da máxima. */
function pctReserve(avgHr) {
  if (!avgHr || !hrProfile.maxHr || !hrProfile.restHr) return null;
  const denom = hrProfile.maxHr - hrProfile.restHr;
  if (denom <= 0) return null;
  return ((avgHr - hrProfile.restHr) / denom) * 100;
}

function kcalPerMin(session) {
  if (!session || !session.calories || !session.durationMin) return null;
  return session.calories / session.durationMin;
}

/* As quatro combinações possíveis de escala e resultado. É esta cruz que
 * responde a "como reagi ao treino": Rx dentro do tempo e Scaled fora do
 * tempo são mundos diferentes, e a média de ambos não significa nada. */
const OUTCOMES = {
  rxIn:      { label: 'Rx · dentro',     short: 'R✓', color: 'var(--load)' },
  rxOut:     { label: 'Rx · cap',        short: 'R✕', color: 'var(--oxide)' },
  scaledIn:  { label: 'Scaled · dentro', short: 'S✓', color: '#6E8AA8' },
  scaledOut: { label: 'Scaled · cap',    short: 'S✕', color: '#5C6675' }
};

function outcomeKey(w) {
  const isRx = (w.scaling === 'rx' || w.scaling === 'rxplus');
  const inTime = (w.finished !== false);
  return isRx ? (inTime ? 'rxIn' : 'rxOut') : (inTime ? 'scaledIn' : 'scaledOut');
}

function renderWodSection(allWods, dateBySession, sessionById) {
  const select = $('#ev-wod');
  const named = allWods.filter((w) => w.name);

  const names = Array.from(new Set(named.map((w) => w.name))).sort();
  const previous = select.value;
  select.innerHTML = '';
  names.forEach((n) => {
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = n;
    select.appendChild(opt);
  });
  if (names.indexOf(previous) >= 0) select.value = previous;

  const tbody = $('#wod-table').querySelector('tbody');

  if (!names.length) {
    select.hidden = true;
    $('#wod-strip').innerHTML = '';
    $('#wod-matrix').innerHTML = '';
    $('#chart-wod').innerHTML = '<p class="chart-empty">Regista um WOD com nome para o comparares.</p>';
    $('#wod-hint').textContent = '';
    $('#wod-intensity-hint').textContent = '';
    tbody.innerHTML = '';
    return;
  }
  select.hidden = false;

  const chosen = select.value || names[0];
  const attempts = named
    .filter((w) => w.name === chosen)
    .map((w) => ({ wod: w, date: dateBySession[w.sessionId], session: sessionById[w.sessionId] }))
    .filter((a) => a.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const isAmrap = attempts.filter((a) => a.wod.format === 'amrap').length > attempts.length / 2;
  const hasCap = attempts.some((a) => a.wod.capMin != null || a.wod.finished === false);

  renderOutcomeStrip(attempts, isAmrap);
  renderOutcomeMatrix(attempts, isAmrap);
  renderWodChart(attempts, isAmrap, hasCap);
  renderWodTable(attempts, tbody);
}

/* Sequência de tentativas, da mais antiga para a mais recente. Lê-se de
 * relance se estás a passar mais vezes dentro do tempo. */
function renderOutcomeStrip(attempts, isAmrap) {
  const host = $('#wod-strip');
  if (isAmrap) { host.innerHTML = ''; return; }

  const items = attempts.map((a) => {
    const key = outcomeKey(a.wod);
    return {
      color: OUTCOMES[key].color,
      label: OUTCOMES[key].short,
      hollow: (key === 'rxOut'),
      title: prettyDate(a.date) + ' · ' + OUTCOMES[key].label + ' · ' + (wodResult(a.wod) || '—')
    };
  });

  const inTime = attempts.filter((a) => a.wod.finished !== false).length;
  Chart.strip(host, items, {
    caption: inTime + ' de ' + attempts.length + ' dentro do tempo'
  });
}

function renderOutcomeMatrix(attempts, isAmrap) {
  const host = $('#wod-matrix');
  host.innerHTML = '';
  if (isAmrap || !attempts.length) return;

  const count = { rxIn: [], rxOut: [], scaledIn: [], scaledOut: [] };
  attempts.forEach((a) => { count[outcomeKey(a.wod)].push(a); });

  // Tempo médio das que acabaram, para a célula dizer mais que uma contagem.
  const avgTime = (list) => {
    const done = list.filter((a) => a.wod.timeSec != null && a.wod.finished !== false);
    if (!done.length) return null;
    return done.reduce((s, a) => s + a.wod.timeSec, 0) / done.length;
  };
  const avgReps = (list) => {
    const done = list.filter((a) => a.wod.repsDone != null);
    if (!done.length) return null;
    return done.reduce((s, a) => s + a.wod.repsDone, 0) / done.length;
  };

  const table = document.createElement('table');
  table.className = 'data-table matrix';
  table.innerHTML =
    '<thead><tr><th></th><th>Dentro do tempo</th><th>Bateu no cap</th></tr></thead>' +
    '<tbody>' +
      '<tr><td>Rx</td>' +
        matrixCell(count.rxIn, avgTime(count.rxIn), null) +
        matrixCell(count.rxOut, null, avgReps(count.rxOut)) +
      '</tr>' +
      '<tr><td>Scaled</td>' +
        matrixCell(count.scaledIn, avgTime(count.scaledIn), null) +
        matrixCell(count.scaledOut, null, avgReps(count.scaledOut)) +
      '</tr>' +
    '</tbody>';

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  wrap.appendChild(table);
  host.appendChild(wrap);
}

function matrixCell(list, avgT, avgR) {
  if (!list.length) return '<td class="matrix-empty">—</td>';
  let detail = '';
  if (avgT != null) detail = '<span class="matrix-sub">' + fmtTime(avgT) + ' médio</span>';
  else if (avgR != null) detail = '<span class="matrix-sub">' + Math.round(avgR) + ' reps médias</span>';
  return '<td><b>' + list.length + '</b>' + detail + '</td>';
}

/* Com tempo limite, a linha de tempos não serve: quem bate no cap fica
 * sempre com o mesmo valor. A intensidade em kcal/min é que mostra como
 * reagiste, e a tira acima já diz se passaste ou não. */
function renderWodChart(attempts, isAmrap, hasCap) {
  const host = $('#chart-wod');

  if (isAmrap) {
    const pts = attempts.filter((a) => a.wod.rounds != null)
      .map((a) => ({ x: a.date, y: a.wod.rounds, color: OUTCOMES[outcomeKey(a.wod)].color }));
    Chart.line(host, pts, { format: (v) => v.toFixed(0) + ' rondas', pathColor: 'var(--ink-faint)' });
    $('#wod-hint').textContent = 'Mais rondas é melhor.';
    return;
  }

  if (hasCap) {
    const pts = attempts
      .map((a) => ({
        x: a.date,
        y: kcalPerMin(a.session),
        color: OUTCOMES[outcomeKey(a.wod)].color
      }))
      .filter((p) => p.y != null);

    if (pts.length) {
      Chart.line(host, pts, {
        format: (v) => v.toFixed(1) + ' kcal/min',
        pathColor: 'var(--ink-faint)'
      });
      $('#wod-hint').textContent =
        'Com tempo limite, o tempo diz pouco: quem bate no cap fica sempre no mesmo ' +
        'valor. A linha é a intensidade em kcal/min e a cor é o resultado — a tira ' +
        'acima mostra se passaste dentro do tempo.';
    } else {
      host.innerHTML = '<p class="chart-empty">Regista calorias e duração para ver a intensidade.</p>';
      $('#wod-hint').textContent = 'A tira acima já mostra o histórico de dentro do tempo.';
    }
    return;
  }

  const finished = attempts.filter((a) => a.wod.finished !== false && a.wod.timeSec != null);
  if (finished.length) {
    const pts = finished.map((a) => ({
      x: a.date, y: a.wod.timeSec, color: OUTCOMES[outcomeKey(a.wod)].color
    }));
    Chart.line(host, pts, { format: (v) => fmtTime(v), pathColor: 'var(--ink-faint)' });
    $('#wod-hint').textContent = 'Sem tempo limite definido — menos tempo é melhor.';
  } else {
    host.innerHTML = '<p class="chart-empty">Sem resultados registados.</p>';
    $('#wod-hint').textContent = '';
  }
}

function renderWodTable(attempts, tbody) {
  tbody.innerHTML = '';

  if (!attempts.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Sem tentativas.</td></tr>';
    return;
  }

  attempts.slice().reverse().forEach((a) => {
    const pct = pctMaxHr(a.session ? a.session.avgHr : null);
    const kcal = kcalPerMin(a.session);
    const key = outcomeKey(a.wod);
    const capped = a.wod.finished === false;

    const tr = document.createElement('tr');
    tr.className = 'clickable';
    tr.tabIndex = 0;
    tr.innerHTML =
      '<td>' + prettyDate(a.date) + '</td>' +
      '<td' + (capped ? ' class="capped"' : '') + '>' + escapeHtml(wodResult(a.wod) || '—') + '</td>' +
      '<td><span class="badge" style="--c:' + OUTCOMES[key].color + '">' +
        scalingLabel(a.wod) + '</span></td>' +
      '<td>' + (pct != null ? Math.round(pct) + '%' : '—') + '</td>' +
      '<td>' + (kcal != null ? kcal.toFixed(1) : '—') + '</td>';

    const detail = buildWodDetail(a);
    detail.hidden = true;

    const toggle = () => {
      detail.hidden = !detail.hidden;
      tr.classList.toggle('is-open', !detail.hidden);
    };
    tr.addEventListener('click', toggle);
    tr.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
    });

    tbody.appendChild(tr);
    tbody.appendChild(detail);
  });

  const withHr = attempts.filter((a) => a.session && a.session.avgHr);
  if (!hrProfile.maxHr) {
    $('#wod-intensity-hint').textContent =
      'Preenche a FC máxima em Definições → Perfil (vais buscá-la ao Garmin) para ' +
      'a coluna de esforço deixar de estar vazia.';
  } else if (!withHr.length) {
    $('#wod-intensity-hint').textContent =
      'Regista a FC média e as calorias nas métricas da sessão para comparar esforço, não só tempo.';
  } else {
    $('#wod-intensity-hint').textContent =
      '%FCmáx calculado sobre ' + hrProfile.maxHr + ' bpm' +
      (hrProfile.estimated ? ' (estimado pela idade — mete o valor do Garmin para ser exacto)' : '') +
      '. As calorias do relógio são estimativas com erro grande: servem para ' +
      'comparar sessões parecidas entre si, não como valor absoluto.';
  }
}

/* Linha de detalhe: o que o treino era, não só o resultado. Sem isto, seis
 * meses depois vês "Chipper · 18:42" e não fazes ideia do que fizeste. */
function buildWodDetail(a) {
  const tr = document.createElement('tr');
  tr.className = 'detail-row';

  const td = document.createElement('td');
  td.colSpan = 5;

  const box = document.createElement('div');
  box.className = 'detail-box';

  const moves = movementsText(a.wod);
  if (moves) {
    const el = document.createElement('p');
    el.className = 'detail-moves';
    el.textContent = moves;
    box.appendChild(el);
  }

  if (a.wod.description) {
    const el = document.createElement('p');
    el.className = 'detail-desc';
    el.textContent = a.wod.description;
    box.appendChild(el);
  }

  const bits = [];
  if (a.wod.capMin != null) bits.push('Limite ' + a.wod.capMin + ':00');
  if (a.session) {
    if (a.session.durationMin) bits.push(a.session.durationMin + ' min');
    if (a.session.calories) bits.push(a.session.calories + ' kcal');
    if (a.session.avgHr) bits.push(a.session.avgHr + ' bpm');
  }
  if (bits.length) {
    const el = document.createElement('p');
    el.className = 'detail-meta';
    el.textContent = bits.join(' · ');
    box.appendChild(el);
  }

  if (a.session && a.session.notes) {
    const el = document.createElement('p');
    el.className = 'detail-notes';
    el.textContent = a.session.notes;
    box.appendChild(el);
  }

  if (!box.children.length) {
    const el = document.createElement('p');
    el.className = 'detail-desc';
    el.textContent = 'Sem descrição nem movimentos registados neste treino.';
    box.appendChild(el);
  }

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'btn-secondary detail-open';
  open.textContent = 'Abrir sessão';
  open.addEventListener('click', (ev) => {
    ev.stopPropagation();   // não voltar a fechar o detalhe
    openEditor(a.wod.sessionId);
  });
  box.appendChild(open);

  td.appendChild(box);
  tr.appendChild(td);
  return tr;
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

/* Semana ISO, para as barras baterem certo com a semana de treino. */
function weekKey(dateISO) {
  const d = new Date(dateISO + 'T00:00:00');
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;          // segunda = 0
  target.setDate(target.getDate() - dayNr + 3); // quinta da mesma semana
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target - firstThursday;
  const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
  return target.getFullYear() + '-S' + String(week).padStart(2, '0');
}

/* ---------- Definições ---------- */

async function renderSettings() {
  const [sessions, sets, wods, body] = await Promise.all([
    DB.getSessions(), DB.getAllSets(), DB.getAllWods(), DB.getBodyMetrics()
  ]);

  $('#stat-line').textContent =
    sessions.length + ' sessões · ' + sets.length + ' séries · ' +
    wods.length + ' WODs · ' + body.length + ' medições';

  const last = await DB.getSetting('lastBackupAt', null);
  $('#last-backup-line').textContent = last
    ? 'Última exportação: ' + prettyDate(last.slice(0, 10))
    : 'Nunca exportaste. Faz uma cópia agora.';

  const interval = await DB.getSetting('backupIntervalDays', 14);
  $('#f-backup-interval').value = String(interval);

  $('#p-height').value = await DB.getSetting('heightCm', '') || '';
  $('#p-birthyear').value = await DB.getSetting('birthYear', '') || '';
  $('#p-sex').value = await DB.getSetting('sex', '') || '';
  $('#p-maxhr').value = await DB.getSetting('maxHr', '') || '';
  $('#p-resthr').value = await DB.getSetting('restingHr', '') || '';
  $('#p-weekly-target').value = String(weeklyTarget);

  await loadHrProfile();
  $('#hr-hint').textContent = hrProfile.maxHr
    ? (hrProfile.estimated
        ? 'A usar ' + hrProfile.maxHr + ' bpm, estimado pela tua idade. O Garmin dá-te o valor real — vale a pena substituir.'
        : 'A usar ' + hrProfile.maxHr + ' bpm.' + (hrProfile.restHr ? '' : ' A FC de repouso é opcional, mas afina os cálculos de esforço.'))
    : 'Vai buscar os dois valores ao Garmin Connect. Sem a FC máxima não há cálculo de esforço.';

  await renderDriveStatus();
  renderCatalog();
}

/* ---------- Google Drive ---------- */

async function renderDriveStatus() {
  const status = $('#drive-status');
  const auto = await DB.getSetting('driveAuto', false);
  $('#f-drive-auto').checked = !!auto;

  if (!Drive.configured()) {
    status.textContent = 'Falta colar o Client ID no ficheiro js/drive.js.';
    $('#btn-drive-backup').disabled = true;
    $('#btn-drive-restore').disabled = true;
    $('#f-drive-auto').disabled = true;
    return;
  }

  $('#btn-drive-backup').disabled = false;
  $('#btn-drive-restore').disabled = false;
  $('#f-drive-auto').disabled = false;

  const last = await DB.getSetting('lastDriveBackupAt', null);
  status.textContent = last
    ? 'Última cópia no Drive: ' + prettyDate(last.slice(0, 10))
    : 'Ainda não há cópia no Drive.';
}

async function doDriveBackup(silent) {
  try {
    if (!silent) toast('A enviar para o Drive…');
    await Drive.backup();
    await renderDriveStatus();
    await refreshBackupState();
    toast('Cópia enviada para o Drive');
    return true;
  } catch (err) {
    console.error(err);
    // Em silêncio não vale a pena incomodar: o botão manual continua lá.
    if (!silent) toast('Falhou: ' + err.message);
    return false;
  }
}

async function doDriveRestore() {
  if (!confirm('Trazer a cópia do Drive e juntar aos dados actuais?')) return;
  try {
    toast('A descarregar…');
    const result = await Drive.restore();

    exercises = await DB.getExercises();
    indexExercises();
    fillExercisePicker();
    fillWodExercisePicker();
    await loadDiet();
    await renderSessionList();
    await renderBodyList();
    await renderDietGrid();
    await renderSettings();

    toast(result.sessions + ' sessões e ' + result.bodyMetrics + ' medições restauradas');
  } catch (err) {
    console.error(err);
    toast('Falhou: ' + err.message);
  }
}

/* Corre ao abrir a app: se o prazo passou e há autorização válida guardada,
 * a cópia sobe sozinha. Se a autorização já expirou, falha em silêncio e
 * o aviso encarnado aparece para carregares no botão. */
async function maybeAutoBackup() {
  if (!Drive.configured()) return;
  if (!await DB.getSetting('driveAuto', false)) return;

  const interval = Number(await DB.getSetting('backupIntervalDays', 14));
  if (!interval) return;

  const last = await DB.getSetting('lastDriveBackupAt', null);
  if (last) {
    const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
    if (days < interval) return;
  }

  const sessions = await DB.getSessions();
  if (!sessions.length) return;   // nada para copiar

  await doDriveBackup(true);
}

function renderCatalog() {
  const host = $('#catalog-list');
  host.innerHTML = '';
  exercises.forEach((e) => {
    const row = document.createElement('div');
    row.className = 'catalog-row';

    const name = document.createElement('span');
    name.className = 'catalog-name';
    name.textContent = e.name;

    const cat = document.createElement('span');
    cat.className = 'catalog-cat';
    cat.textContent = e.category;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'set-remove';
    del.textContent = '×';
    del.setAttribute('aria-label', 'Apagar ' + e.name);
    del.addEventListener('click', async () => {
      const used = await DB.countSetsForExercise(e.id);
      if (used > 0) {
        return toast('Tem ' + used + ' séries gravadas. Não pode ser apagado.');
      }
      await DB.deleteExercise(e.id);
      exercises = await DB.getExercises();
      indexExercises();
      fillExercisePicker();
      fillWodExercisePicker();
      renderCatalog();
      toast('Movimento apagado');
    });

    row.appendChild(name);
    row.appendChild(cat);
    row.appendChild(del);
    host.appendChild(row);
  });
}

async function refreshBackupState() {
  const interval = Number(await DB.getSetting('backupIntervalDays', 14));
  const banner = $('#backup-banner');

  if (!interval) { banner.hidden = true; return; }

  const last = await DB.getSetting('lastBackupAt', null);
  if (!last) {
    $('#backup-banner-text').textContent = 'Nunca fizeste uma cópia dos dados.';
    banner.hidden = false;
    return;
  }

  const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
  if (days >= interval) {
    $('#backup-banner-text').textContent = 'Última cópia há ' + days + ' dias.';
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
}

async function exportJSON() {
  const payload = await DB.exportAll();
  downloadFile(
    JSON.stringify(payload, null, 2),
    'treino-' + todayISO() + '.json',
    'application/json'
  );
  await DB.setSetting('lastBackupAt', new Date().toISOString());
  await refreshBackupState();
  toast('Exportado');
}

async function importJSON(file) {
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    if (payload.app && payload.app !== 'treino') {
      return toast('Este ficheiro é de outra app.');
    }
    const result = await DB.importAll(payload);

    exercises = await DB.getExercises();
    indexExercises();
    fillExercisePicker();
    fillWodExercisePicker();
    await loadDiet();
    await renderSessionList();
    await renderBodyList();
    await renderDietGrid();
    await renderSettings();

    toast(result.sessions + ' sessões e ' + result.bodyMetrics + ' medições importadas');
  } catch (err) {
    console.error(err);
    toast('Ficheiro inválido: ' + err.message);
  }
}

/* CSV com ponto e vírgula e BOM — é o que o Excel português lê sem perguntar nada. */
function toCSV(headers, rows) {
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.join(';')];
  rows.forEach((r) => lines.push(r.map(esc).join(';')));
  return '\ufeff' + lines.join('\r\n');
}

async function exportCSV(kind) {
  const [sessions, sets, wods, body] = await Promise.all([
    DB.getSessions(), DB.getAllSets(), DB.getAllWods(), DB.getBodyMetrics()
  ]);
  const dateBySession = {};
  sessions.forEach((s) => { dateBySession[s.id] = s.date; });

  let csv, name;

  if (kind === 'sessions') {
    name = 'sessoes';
    csv = toCSV(
      ['data', 'duracao_min', 'calorias', 'fc_media', 'notas'],
      sessions.map((s) => [s.date, s.durationMin, s.calories, s.avgHr, s.notes])
    );
  } else if (kind === 'sets') {
    name = 'series';
    const rows = sets
      .map((s) => ({ s: s, date: dateBySession[s.sessionId] }))
      .filter((r) => r.date)
      .sort((a, b) => a.date.localeCompare(b.date) || a.s.order - b.s.order);
    csv = toCSV(
      ['data', 'movimento', 'ordem', 'reps', 'carga_kg', 'pct_pr', 'aquecimento', 'volume_kg', 'e1rm_kg'],
      rows.map((r) => [
        r.date, exerciseName(r.s.exerciseId), r.s.order, r.s.reps, r.s.weightKg,
        r.s.pctPr != null ? r.s.pctPr : '',
        r.s.warmup ? 'sim' : 'nao',
        (r.s.reps * r.s.weightKg).toFixed(1),
        r.s.warmup ? '' : epley(r.s.weightKg, r.s.reps).toFixed(1)
      ])
    );
  } else if (kind === 'wods') {
    name = 'wods';
    const rows = wods
      .map((w) => ({ w: w, date: dateBySession[w.sessionId] }))
      .filter((r) => r.date)
      .sort((a, b) => a.date.localeCompare(b.date));
    csv = toCSV(
      ['data', 'nome', 'formato', 'tempo_seg', 'concluiu', 'cap_min', 'reps_feitas',
       'rondas', 'reps_extra', 'movimentos', 'escala', 'descricao'],
      rows.map((r) => [
        r.date, r.w.name, r.w.format, r.w.timeSec,
        r.w.finished === false ? 'nao' : 'sim', r.w.capMin, r.w.repsDone,
        r.w.rounds, r.w.extraReps, movementsText(r.w), r.w.scaling, r.w.description
      ])
    );
  } else {
    name = 'corpo';
    // A marcação do plano vai na mesma folha: é a mesma linha temporal
    // e evita andar a cruzar dois ficheiros à mão no Excel.
    csv = toCSV(
      ['data', 'peso_kg', 'massa_gorda_pct', 'cintura_cm', 'anca_cm', 'peito_cm',
       'braco_dto_cm', 'coxa_dta_cm', 'pescoco_cm', 'plano_alimentar', 'notas'],
      body.slice().sort((a, b) => a.date.localeCompare(b.date)).map((b) => {
        const m = b.measures || {};
        const diet = dietMap[b.date];
        return [b.date, b.weightKg, b.bodyFatPct, m.waist, m.hip, m.chest,
          m.armR, m.thighR, m.neck,
          diet === true ? 'cumpri' : diet === false ? 'nao cumpri' : '', b.notes];
      })
    );
  }

  downloadFile(csv, 'treino-' + name + '-' + todayISO() + '.csv', 'text/csv;charset=utf-8');
  toast('CSV exportado');
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Sem o atraso, o Android por vezes cancela a transferência a meio.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function wipeEverything() {
  if (!confirm('Isto apaga sessões, séries, WODs, medições e catálogo. Tens uma exportação recente?')) return;
  if (!confirm('Confirmas mesmo? Não há forma de desfazer.')) return;

  await DB.clearAllData();
  exercises = await DB.seedExercisesIfEmpty();
  indexExercises();
  fillExercisePicker();
  fillWodExercisePicker();
  await loadDiet();
  await renderSessionList();
  await renderBodyList();
  await renderDietGrid();
  await renderSettings();
  toast('Tudo apagado');
}

/* ---------- Eventos ---------- */

function bindEvents() {
  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => switchTab(t.dataset.target));
  });

  // Sessões
  $('#btn-new-session').addEventListener('click', () => openEditor(null));
  $('#btn-cancel').addEventListener('click', () => { editor = null; switchTab('treino'); });
  $('#btn-save').addEventListener('click', saveEditor);
  $('#btn-delete').addEventListener('click', removeSession);
  $('#f-wod-format').addEventListener('change', refreshWodFields);

  $('#f-wod-exercise-pick').addEventListener('change', (ev) => {
    const value = ev.target.value;
    ev.target.value = '';
    if (!value) return;
    wodMovements.push({ exerciseId: value, reps: '', weightKg: null });
    renderWodMovements();
  });

  ['#f-wod-cap', '#f-wod-min', '#f-wod-sec'].forEach((sel) => {
    $(sel).addEventListener('input', refreshWodFields);
  });

  document.querySelectorAll('#wod-scaling .seg').forEach((b) => {
    b.addEventListener('click', () => setWodScaling(b.dataset.scaling));
  });

  $('#f-exercise-pick').addEventListener('change', (ev) => {
    const value = ev.target.value;
    ev.target.value = '';
    if (!value) return;
    if (value === '__new__') {
      $('#new-exercise').hidden = false;
      $('#f-new-exercise-name').focus();
      return;
    }
    addGroup(value);
  });

  $('#btn-create-exercise').addEventListener('click', async () => {
    const name = $('#f-new-exercise-name').value.trim();
    if (!name) return toast('Escreve o nome do movimento.');
    const record = await DB.addExercise(name, $('#f-new-exercise-cat').value);
    exercises = await DB.getExercises();
    indexExercises();
    fillExercisePicker();
    fillWodExercisePicker();
    $('#f-new-exercise-name').value = '';
    $('#new-exercise').hidden = true;
    addGroup(record.id);
  });

  // Corpo
  $('#btn-new-body').addEventListener('click', () => openBodyEditor(null));

  $('#diet-prev').addEventListener('click', () => {
    dietMonth.month -= 1;
    if (dietMonth.month < 0) { dietMonth.month = 11; dietMonth.year -= 1; }
    renderDietGrid();
  });
  $('#diet-next').addEventListener('click', () => {
    dietMonth.month += 1;
    if (dietMonth.month > 11) { dietMonth.month = 0; dietMonth.year += 1; }
    renderDietGrid();
  });
  $('#btn-body-cancel').addEventListener('click', () => { bodyEditor = null; switchTab('corpo'); });
  $('#btn-body-save').addEventListener('click', saveBodyEditor);
  $('#btn-body-delete').addEventListener('click', removeBodyMetric);

  // Evolução
  $('#ev-exercise').addEventListener('change', renderEvolution);
  $('#ev-measure').addEventListener('change', renderEvolution);
  $('#ev-wod').addEventListener('change', renderEvolution);

  document.querySelectorAll('#lens-picker .seg').forEach((b) => {
    b.addEventListener('click', () => {
      currentLens = b.dataset.lens;
      renderEvolution();
    });
  });

  $('#period-select').addEventListener('change', (ev) => {
    currentPeriodDays = Number(ev.target.value);
    renderEvolution();
  });

  // Definições
  $('#btn-export-json').addEventListener('click', exportJSON);
  $('#btn-banner-backup').addEventListener('click', exportJSON);
  $('#btn-import-json').addEventListener('click', () => $('#file-import').click());
  $('#file-import').addEventListener('change', (ev) => {
    const file = ev.target.files[0];
    if (file) importJSON(file);
    ev.target.value = '';   // permite reimportar o mesmo ficheiro
  });
  $('#f-backup-interval').addEventListener('change', async (ev) => {
    await DB.setSetting('backupIntervalDays', Number(ev.target.value));
    await refreshBackupState();
  });
  $('#btn-csv-sessions').addEventListener('click', () => exportCSV('sessions'));
  $('#btn-csv-sets').addEventListener('click', () => exportCSV('sets'));
  $('#btn-csv-wods').addEventListener('click', () => exportCSV('wods'));
  $('#btn-csv-body').addEventListener('click', () => exportCSV('body'));
  $('#btn-cat-add').addEventListener('click', async () => {
    const name = $('#f-cat-name').value.trim();
    if (!name) return toast('Escreve o nome do movimento.');
    await DB.addExercise(name, $('#f-cat-category').value);
    exercises = await DB.getExercises();
    indexExercises();
    fillExercisePicker();
    fillWodExercisePicker();
    renderCatalog();
    $('#f-cat-name').value = '';
    toast('Movimento criado');
  });
  $('#btn-wipe').addEventListener('click', wipeEverything);

  // Perfil
  $('#p-height').addEventListener('change', (ev) =>
    DB.setSetting('heightCm', numOrNull(ev.target.value)));
  $('#p-birthyear').addEventListener('change', (ev) =>
    DB.setSetting('birthYear', numOrNull(ev.target.value)));
  $('#p-sex').addEventListener('change', (ev) =>
    DB.setSetting('sex', ev.target.value));
  $('#p-maxhr').addEventListener('change', async (ev) => {
    await DB.setSetting('maxHr', numOrNull(ev.target.value));
    await renderSettings();
  });
  $('#p-resthr').addEventListener('change', async (ev) => {
    await DB.setSetting('restingHr', numOrNull(ev.target.value));
    await renderSettings();
  });
  $('#p-weekly-target').addEventListener('change', async (ev) => {
    weeklyTarget = Number(ev.target.value);
    await DB.setSetting('weeklyTarget', weeklyTarget);
    toast('Alvo: ' + weeklyTarget + ' sessões por semana');
  });

  // Google Drive
  $('#btn-drive-backup').addEventListener('click', async () => {
    // Primeiro carregar pede autorização; a partir daí é silencioso.
    try {
      if (!await DB.getSetting('lastDriveBackupAt', null)) await Drive.connect();
    } catch (err) {
      return toast('Autorização falhou: ' + err.message);
    }
    doDriveBackup(false);
  });

  $('#btn-drive-restore').addEventListener('click', async () => {
    try {
      if (!await DB.getSetting('lastDriveBackupAt', null)) await Drive.connect();
    } catch (err) {
      return toast('Autorização falhou: ' + err.message);
    }
    doDriveRestore();
  });

  $('#f-drive-auto').addEventListener('change', async (ev) => {
    if (ev.target.checked) {
      try {
        await Drive.connect();
      } catch (err) {
        ev.target.checked = false;
        return toast('Autorização falhou: ' + err.message);
      }
    }
    await DB.setSetting('driveAuto', ev.target.checked);
    toast(ev.target.checked ? 'Cópia automática ligada' : 'Cópia automática desligada');
  });
}

function addGroup(exerciseId) {
  // Se o exercício já está na sessão, acrescenta uma série ao grupo existente.
  const existing = editor.groups.find((g) => g.exerciseId === exerciseId);
  if (existing) {
    const last = existing.sets[existing.sets.length - 1];
    existing.sets.push(last
      ? { reps: last.reps, weightKg: last.weightKg, warmup: false }
      : { reps: null, weightKg: null, warmup: false });
  } else {
    editor.groups.push({
      exerciseId: exerciseId,
      pctPr: null,
      sets: [{ reps: null, weightKg: null, warmup: false }]
    });
  }
  renderGroups();
}

/* ---------- Utilitários ---------- */

function numOrNull(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function todayISO() {
  return isoOf(new Date());
}

function isoOf(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/* Sexta-feira mais recente, hoje inclusive. */
function lastFridayISO() {
  const d = new Date();
  const back = (d.getDay() - 5 + 7) % 7;
  d.setDate(d.getDate() - back);
  return isoOf(d);
}

function prettyDate(iso) {
  const [y, m, day] = String(iso).split('-');
  return day + ' ' + MONTHS_PT[Number(m) - 1].toLowerCase() + ' ' + y;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

let toastTimer = null;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function registerServiceWorker() {
  // Só funciona em http/https. Aberto do disco, é ignorado sem erro visível.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
