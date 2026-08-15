/* app.js — interface e lógica de ecrã.
 * Toda a persistência passa pelo objecto DB definido em db.js. */

const MONTHS_PT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

let exercises = [];          // catálogo carregado uma vez
let exercisesById = {};      // atalho id -> registo
let wodNamesSeen = [];       // alimenta o autocompletar de nomes de WOD

/* Estado do editor. As séries vivem aqui até se carregar em Guardar;
 * os campos simples são lidos directamente do DOM. */
let editor = null;

const $ = (sel) => document.querySelector(sel);

/* ---------- Arranque ---------- */

async function init() {
  await DB.openDB();
  exercises = await DB.seedExercisesIfEmpty();
  indexExercises();
  fillExercisePicker();
  bindEvents();
  await renderSessionList();
  registerServiceWorker();
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

function switchTab(target) {
  document.querySelectorAll('#app > .view').forEach((v) => {
    v.hidden = v.dataset.view !== target;
  });
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('is-active', t.dataset.target === target);
  });
  $('#tabbar').hidden = false;
  window.scrollTo(0, 0);
}

/* ---------- Lista de sessões ---------- */

async function renderSessionList() {
  const sessions = await DB.getSessions();
  const list = $('#session-list');
  list.innerHTML = '';

  $('#empty-sessions').hidden = sessions.length > 0;

  // Carrega séries e wod de cada sessão para conseguir mostrar o resumo.
  const details = await Promise.all(sessions.map(async (s) => ({
    session: s,
    sets: await DB.getSetsBySession(s.id),
    wods: await DB.getWodsBySession(s.id)
  })));

  // Guarda os nomes de WOD já usados, para o autocompletar.
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

  const [y, m, day] = session.date.split('-');

  const rail = document.createElement('div');
  rail.className = 'card-rail';
  rail.innerHTML =
    '<div class="card-day">' + day + '</div>' +
    '<span class="card-month">' + MONTHS_PT[Number(m) - 1] + ' ' + y.slice(2) + '</span>';

  const main = document.createElement('div');
  main.className = 'card-main';

  // Linha de métricas
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

  // Melhor série de trabalho por exercício
  const working = sets.filter((s) => !s.warmup);
  const best = {};
  working.forEach((s) => {
    if (!best[s.exerciseId] || s.weightKg > best[s.exerciseId].weightKg) best[s.exerciseId] = s;
  });
  const bestList = Object.keys(best);

  if (bestList.length) {
    const el = document.createElement('div');
    el.className = 'card-lifts';
    bestList.slice(0, 3).forEach((exId) => {
      const s = best[exId];
      const name = exercisesById[exId] ? exercisesById[exId].name : 'Movimento removido';
      const line = document.createElement('div');
      line.innerHTML = escapeHtml(name) + '  <b>' + fmtKg(s.weightKg) + '</b> × ' + s.reps;
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

  // WOD
  if (wods.length && (wods[0].name || wods[0].description)) {
    const w = wods[0];
    const el = document.createElement('div');
    el.className = 'card-wod';
    el.innerHTML = '<strong>' + escapeHtml(w.name || 'WOD') + '</strong>' +
      (wodResult(w) ? ' · ' + escapeHtml(wodResult(w)) : '') +
      ' · ' + (w.scaling === 'rx' ? 'Rx' : 'Scaled');
    main.appendChild(el);
  }

  // Volume total do trabalho de força
  const volume = working.reduce((sum, s) => sum + (s.reps * s.weightKg), 0);
  if (volume > 0) {
    const el = document.createElement('div');
    el.className = 'card-volume';
    el.textContent = 'Volume ' + Math.round(volume).toLocaleString('pt-PT') + ' kg';
    main.appendChild(el);
  }

  card.appendChild(rail);
  card.appendChild(main);
  return card;
}

function wodResult(w) {
  if (w.format === 'forTime' && w.timeSec != null) {
    const min = Math.floor(w.timeSec / 60);
    const sec = w.timeSec % 60;
    return min + ':' + String(sec).padStart(2, '0');
  }
  if (w.format === 'amrap' && w.rounds != null) {
    return w.rounds + (w.extraReps ? '+' + w.extraReps : '') + ' rondas';
  }
  return '';
}

/* ---------- Editor ---------- */

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
    isNew: !session,
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
  $('#f-wod-scaling').value = w ? w.scaling : 'rx';
  $('#f-wod-min').value = w && w.timeSec != null ? Math.floor(w.timeSec / 60) : '';
  $('#f-wod-sec').value = w && w.timeSec != null ? w.timeSec % 60 : '';
  $('#f-wod-rounds').value = w && w.rounds != null ? w.rounds : '';
  $('#f-wod-extra').value = w && w.extraReps != null ? w.extraReps : '';
  $('#f-wod-weight').value = w && w.weightKg != null ? w.weightKg : '';
  $('#f-wod-desc').value = w ? (w.description || '') : '';

  refreshWodFields();
  fillWodNames();
  renderGroups();

  document.querySelectorAll('#app > .view').forEach((v) => { v.hidden = true; });
  $('#view-editor').hidden = false;
  $('#tabbar').hidden = true;
  window.scrollTo(0, 0);
}

/* Reagrupa as séries por exercício, mantendo a ordem gravada. */
function groupSets(sets) {
  const groups = [];
  const byExercise = {};
  sets.forEach((s) => {
    if (!byExercise[s.exerciseId]) {
      byExercise[s.exerciseId] = { exerciseId: s.exerciseId, sets: [] };
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

/* Só mostra os campos de resultado que fazem sentido para o formato escolhido. */
function refreshWodFields() {
  const format = $('#f-wod-format').value;
  $('#wod-time-fields').hidden = (format === 'amrap');
  $('#wod-round-fields').hidden = (format !== 'amrap');
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
    name.textContent = exercisesById[group.exerciseId]
      ? exercisesById[group.exerciseId].name
      : 'Movimento removido';
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

/* ---------- Guardar ---------- */

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

  // Achata os grupos em séries individuais, guardando a ordem.
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
  if (wodName || wodDesc) {
    const format = $('#f-wod-format').value;
    const min = numOrNull($('#f-wod-min').value);
    const sec = numOrNull($('#f-wod-sec').value);
    const hasTime = min != null || sec != null;

    wods.push({
      id: DB.uid(),
      sessionId: session.id,
      name: wodName,
      format: format,
      timeSec: (format !== 'amrap' && hasTime) ? ((min || 0) * 60 + (sec || 0)) : null,
      rounds: format === 'amrap' ? numOrNull($('#f-wod-rounds').value) : null,
      extraReps: format === 'amrap' ? numOrNull($('#f-wod-extra').value) : null,
      weightKg: numOrNull($('#f-wod-weight').value),
      scaling: $('#f-wod-scaling').value,
      description: wodDesc
    });
  }

  if (!sets.length && !wods.length && session.durationMin == null) {
    return toast('Sessão vazia. Preenche pelo menos a duração.');
  }

  await DB.saveSession(session, sets, wods);
  await renderSessionList();
  closeEditor();
  toast('Sessão guardada');
}

async function removeSession() {
  if (!confirm('Apagar esta sessão e tudo o que tem dentro?')) return;
  await DB.deleteSession(editor.id);
  await renderSessionList();
  closeEditor();
  toast('Sessão apagada');
}

function closeEditor() {
  editor = null;
  switchTab('treino');
}

/* ---------- Eventos ---------- */

function bindEvents() {
  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => switchTab(t.dataset.target));
  });

  $('#btn-new-session').addEventListener('click', () => openEditor(null));
  $('#btn-cancel').addEventListener('click', closeEditor);
  $('#btn-save').addEventListener('click', saveEditor);
  $('#btn-delete').addEventListener('click', removeSession);
  $('#f-wod-format').addEventListener('change', refreshWodFields);

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

    $('#f-new-exercise-name').value = '';
    $('#new-exercise').hidden = true;
    addGroup(record.id);
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

function fmtKg(kg) {
  return Number.isInteger(kg) ? String(kg) : String(kg);
}

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
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
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

function registerServiceWorker() {
  // Só funciona em http/https. Aberto do disco, é ignorado sem erro visível.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
