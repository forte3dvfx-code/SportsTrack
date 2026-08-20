/* app.js — interface e lógica de ecrã.
 * Toda a persistência passa pelo objecto DB definido em db.js.
 * Os gráficos passam pelo objecto Chart definido em chart.js. */

const MONTHS_PT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

const MEASURE_LABELS = {
  waist: 'Cintura', hip: 'Anca', chest: 'Peito',
  armR: 'Braço direito', thighR: 'Coxa direita', neck: 'Pescoço'
};

let exercises = [];          // catálogo carregado uma vez
let exercisesById = {};      // atalho id -> registo
let wodNamesSeen = [];       // alimenta o autocompletar de nomes de WOD

let editor = null;           // estado do editor de sessão
let bodyEditor = null;       // estado do editor de medição

const $ = (sel) => document.querySelector(sel);

/* ---------- Arranque ---------- */

async function init() {
  await DB.openDB();
  exercises = await DB.seedExercisesIfEmpty();
  indexExercises();
  fillExercisePicker();
  bindEvents();
  await renderSessionList();
  await renderBodyList();
  await refreshBackupState();
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
    if (!best[s.exerciseId] || s.weightKg > best[s.exerciseId].weightKg) best[s.exerciseId] = s;
  });
  const bestList = Object.keys(best);

  if (bestList.length) {
    const el = document.createElement('div');
    el.className = 'card-lifts';
    bestList.slice(0, 3).forEach((exId) => {
      const s = best[exId];
      const line = document.createElement('div');
      line.innerHTML = escapeHtml(exerciseName(exId)) + '  <b>' + s.weightKg + '</b> × ' + s.reps;
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

  if (wods.length && (wods[0].name || wods[0].description)) {
    const w = wods[0];
    const el = document.createElement('div');
    el.className = 'card-wod';
    el.innerHTML = '<strong>' + escapeHtml(w.name || 'WOD') + '</strong>' +
      (wodResult(w) ? ' · ' + escapeHtml(wodResult(w)) : '') +
      ' · ' + (w.scaling === 'rx' ? 'Rx' : 'Scaled');
    main.appendChild(el);
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

function wodResult(w) {
  if (w.format === 'amrap' && w.rounds != null) {
    return w.rounds + (w.extraReps ? '+' + w.extraReps : '') + ' rondas';
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

let currentLens = 'sessoes';
let currentPeriodDays = 90;

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
    renderSessionsLens(sessions);
    return;
  }

  if (currentLens === 'forca') {
    const [sessions, allSets, allWods] = await Promise.all([
      DB.getSessions(), DB.getAllSets(), DB.getAllWods()
    ]);
    const dateBySession = {};
    sessions.forEach((s) => { dateBySession[s.id] = s.date; });
    renderStrengthSection(allSets, dateBySession);
    renderVolumeSection(allSets, dateBySession);
    renderWodSection(allWods, dateBySession);
    return;
  }

  const body = await DB.getBodyMetrics();
  renderWeightSection(body);
  renderMeasureSection(body);
}

/* ---------- Lente: sessões ---------- */

function renderSessionsLens(allSessions) {
  document.querySelectorAll('#period-picker .seg').forEach((b) => {
    b.classList.toggle('is-active', Number(b.dataset.days) === currentPeriodDays);
  });

  // Ordem crescente: os gráficos leem-se da esquerda para a direita.
  const inPeriod = filterByPeriod(allSessions, currentPeriodDays)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  renderSessionTiles(allSessions, inPeriod);
  renderPerWeekChart(inPeriod);
  renderWeekdayChart(inPeriod);

  renderMetricChart('#chart-duration', inPeriod, 'durationMin',
    (v) => Math.round(v) + ' min', 'var(--load)');
  renderMetricChart('#chart-calories', inPeriod, 'calories',
    (v) => Math.round(v) + ' kcal', 'var(--load)');
  renderMetricChart('#chart-hr', inPeriod, 'avgHr',
    (v) => Math.round(v) + ' bpm', 'var(--oxide)');

  renderMonthTable(allSessions);
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
    ['FC média', hrs.length ? Math.round(average(hrs)) : '—', 'bpm'],
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

  Chart.bar($('#chart-perweek'), bars.slice(-26), { format: (v) => v.toFixed(0) + ' treinos' });
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

function renderStrengthSection(allSets, dateBySession) {
  const select = $('#ev-exercise');
  const working = allSets.filter((s) => !s.warmup && s.weightKg > 0 && s.reps > 0);

  // Só entram no selector movimentos com carga registada.
  const used = {};
  working.forEach((s) => { used[s.exerciseId] = (used[s.exerciseId] || 0) + 1; });
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
    $('#chart-strength').innerHTML = '<p class="chart-empty">Regista séries com carga para ver a evolução.</p>';
    $('#strength-prs').innerHTML = '';
    return;
  }
  select.hidden = false;

  const chosen = select.value || ids[0];
  const mine = working.filter((s) => s.exerciseId === chosen);

  // Melhor 1RM estimado de cada dia — uma sessão dá um ponto, não cinco.
  const bestByDate = {};
  mine.forEach((s) => {
    const date = dateBySession[s.sessionId];
    if (!date) return;
    const e = epley(s.weightKg, s.reps);
    if (!bestByDate[date] || e > bestByDate[date].e) bestByDate[date] = { e: e, set: s };
  });

  const points = Object.keys(bestByDate).sort().map((date) => ({
    x: date,
    y: bestByDate[date].e
  }));

  Chart.line($('#chart-strength'), points, { format: (v) => v.toFixed(1) + ' kg' });

  // Recordes reais, não estimados
  const heaviest = mine.slice().sort((a, b) => b.weightKg - a.weightKg)[0];
  const bestVolumeSet = mine.slice().sort((a, b) => (b.reps * b.weightKg) - (a.reps * a.weightKg))[0];
  const bestEpley = mine.slice().sort((a, b) => epley(b.weightKg, b.reps) - epley(a.weightKg, a.reps))[0];

  const prs = $('#strength-prs');
  prs.innerHTML = '';
  [
    ['Série mais pesada', heaviest.weightKg + ' kg × ' + heaviest.reps, dateBySession[heaviest.sessionId]],
    ['Melhor 1RM estimado', epley(bestEpley.weightKg, bestEpley.reps).toFixed(1) + ' kg', dateBySession[bestEpley.sessionId]],
    ['Série de maior volume', (bestVolumeSet.reps * bestVolumeSet.weightKg) + ' kg', dateBySession[bestVolumeSet.sessionId]]
  ].forEach(([label, value, date]) => {
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

function renderWodSection(allWods, dateBySession) {
  const select = $('#ev-wod');
  const named = allWods.filter((w) => w.name && (w.timeSec != null || w.rounds != null));

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

  if (!names.length) {
    select.hidden = true;
    $('#chart-wod').innerHTML = '<p class="chart-empty">Repete um WOD com resultado para o comparares.</p>';
    $('#wod-hint').textContent = '';
    return;
  }
  select.hidden = false;

  const chosen = select.value || names[0];
  const mine = named.filter((w) => w.name === chosen);
  const isAmrap = mine.filter((w) => w.rounds != null).length > mine.length / 2;

  const points = mine
    .map((w) => ({
      x: dateBySession[w.sessionId],
      y: isAmrap ? w.rounds : w.timeSec
    }))
    .filter((p) => p.x && p.y != null)
    .sort((a, b) => a.x.localeCompare(b.x));

  Chart.line($('#chart-wod'), points, {
    format: (v) => isAmrap ? v.toFixed(0) + ' rondas' : fmtTime(v),
    color: 'var(--oxide)'
  });

  $('#wod-hint').textContent = isAmrap
    ? 'Mais rondas é melhor.'
    : 'Menos tempo é melhor — a linha deve descer.';
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

  renderCatalog();
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
    await renderSessionList();
    await renderBodyList();
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
      ['data', 'movimento', 'ordem', 'reps', 'carga_kg', 'aquecimento', 'volume_kg', 'e1rm_kg'],
      rows.map((r) => [
        r.date, exerciseName(r.s.exerciseId), r.s.order, r.s.reps, r.s.weightKg,
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
      ['data', 'nome', 'formato', 'tempo_seg', 'rondas', 'reps_extra', 'carga_kg', 'escala', 'descricao'],
      rows.map((r) => [
        r.date, r.w.name, r.w.format, r.w.timeSec, r.w.rounds,
        r.w.extraReps, r.w.weightKg, r.w.scaling, r.w.description
      ])
    );
  } else {
    name = 'corpo';
    csv = toCSV(
      ['data', 'peso_kg', 'massa_gorda_pct', 'cintura_cm', 'anca_cm', 'peito_cm', 'braco_dto_cm', 'coxa_dta_cm', 'pescoco_cm', 'notas'],
      body.slice().sort((a, b) => a.date.localeCompare(b.date)).map((b) => {
        const m = b.measures || {};
        return [b.date, b.weightKg, b.bodyFatPct, m.waist, m.hip, m.chest, m.armR, m.thighR, m.neck, b.notes];
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
  await renderSessionList();
  await renderBodyList();
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

  // Corpo
  $('#btn-new-body').addEventListener('click', () => openBodyEditor(null));
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

  document.querySelectorAll('#period-picker .seg').forEach((b) => {
    b.addEventListener('click', () => {
      currentPeriodDays = Number(b.dataset.days);
      renderEvolution();
    });
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
    renderCatalog();
    $('#f-cat-name').value = '';
    toast('Movimento criado');
  });
  $('#btn-wipe').addEventListener('click', wipeEverything);
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
