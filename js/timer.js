/* timer.js — temporizador de treino com sinal sonoro.
 *
 * Modos:
 *  - Intervalos: blocos de rondas × trabalho / pausa. Trabalho 0 = "livre":
 *    a ronda acaba quando carregas em Feito (ex.: 10 × 200 m, pausa 45").
 *    Cada bloco pode ter uma lista de exercícios que roda a cada ronda.
 *  - EMOM: a cada N segundos, M rondas.
 *  - AMRAP: contagem decrescente; "+1 ronda" conta as rondas com parciais.
 *  - For time: cronómetro com limite opcional e rondas-alvo.
 *
 * O tempo conta-se pelo relógio (performance.now) e não por ticks, por isso
 * não se atrasa quando o telemóvel abranda a página. Os sons são gerados com
 * Web Audio (sem ficheiros) e há vibração se o telemóvel a tiver. Enquanto
 * corre, pede ao ecrã para não se desligar (Wake Lock); larga-o ao parar.
 *
 * Carregado depois de presets.js e antes de app.js. */

const TIMER_DEFAULT = {
  mode: 'intervals',
  prep: 10,
  sound: true,
  vibrate: true,
  tapCount: true,     // um toque no ecrã conta uma ronda
  blocks: [{ rounds: 8, work: 20, rest: 10, labels: [] }],
  blockRest: 60,
  emom: { every: 60, rounds: 10, labels: [] },
  amrap: { min: 12 },
  fortime: { capMin: null, rounds: null }
};

const TIMER_QUICK = [
  { label: 'Tabata 20/10', cfg: { mode: 'intervals', blocks: [{ rounds: 8, work: 20, rest: 10, labels: [] }], blockRest: 60 } },
  { label: '30/30 × 10', cfg: { mode: 'intervals', blocks: [{ rounds: 10, work: 30, rest: 30, labels: [] }], blockRest: 60 } },
  { label: 'EMOM 10\'', cfg: { mode: 'emom', emom: { every: 60, rounds: 10, labels: [] } } },
  { label: 'AMRAP 12\'', cfg: { mode: 'amrap', amrap: { min: 12 } } },
  { label: 'For time', cfg: { mode: 'fortime', fortime: { capMin: null, rounds: null } } }
];

let timerCfg = null;      // configuração em edição / a correr
let timerReturnTab = 'treino'; // separador para onde volta ao fechar
let lastTapAt = 0;              // para um toque duplo não contar duas rondas
let timerPresetId = null; // preset de onde veio a configuração (para o registo)
let tr = null;            // estado da corrida
let timerInterval = null;
let audioCtx = null;
let wakeLock = null;

function cloneJSON(o) { return JSON.parse(JSON.stringify(o)); }

/* Junta uma configuração parcial aos valores por omissão e limpa números. */
function normalizeTimer(cfg) {
  const c = Object.assign(cloneJSON(TIMER_DEFAULT), cfg ? cloneJSON(cfg) : {});
  const int = (v, d, min, max) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : d;
  };
  if (!['intervals', 'emom', 'amrap', 'fortime'].includes(c.mode)) c.mode = 'intervals';
  c.prep = int(c.prep, 10, 0, 60);
  c.sound = c.sound !== false;
  c.vibrate = c.vibrate !== false;
  c.tapCount = c.tapCount !== false;
  c.blocks = (Array.isArray(c.blocks) && c.blocks.length ? c.blocks : cloneJSON(TIMER_DEFAULT.blocks)).map((b) => ({
    rounds: int(b.rounds, 1, 1, 99),
    work: int(b.work, 0, 0, 7200),
    rest: int(b.rest, 0, 0, 3600),
    labels: Array.isArray(b.labels) ? b.labels.map(String).filter((s) => s.trim()) : [],
    restLabel: b.restLabel ? String(b.restLabel) : ''
  }));
  c.blockRest = int(c.blockRest, 0, 0, 3600);
  c.emom = Object.assign({ every: 60, rounds: 10, labels: [] }, c.emom || {});
  c.emom.every = int(c.emom.every, 60, 5, 3600);
  c.emom.rounds = int(c.emom.rounds, 10, 1, 120);
  c.emom.labels = Array.isArray(c.emom.labels) ? c.emom.labels.map(String).filter((s) => s.trim()) : [];
  c.amrap = { min: int((c.amrap || {}).min, 12, 1, 180) };
  const ft = c.fortime || {};
  c.fortime = {
    capMin: ft.capMin ? int(ft.capMin, null, 1, 300) : null,
    rounds: ft.rounds ? int(ft.rounds, null, 1, 999) : null
  };
  return c;
}

/* A configuração vira uma lista de passos: {kind, dur (s) ou null = livre}. */
function buildTimerSteps(c) {
  const st = [];
  if (c.prep > 0) st.push({ kind: 'prep', dur: c.prep, title: 'Prepara-te' });

  if (c.mode === 'intervals') {
    const n = c.blocks.length;
    c.blocks.forEach((b, bi) => {
      for (let r = 1; r <= b.rounds; r++) {
        const label = b.labels.length ? b.labels[(r - 1) % b.labels.length] : '';
        st.push({ kind: 'work', dur: b.work > 0 ? b.work : null, round: r, rounds: b.rounds,
          block: bi + 1, blocks: n, label, title: b.work > 0 ? 'Trabalho' : 'Esforço livre' });
        const lastRound = r === b.rounds;
        const lastBlock = bi === n - 1;
        if (!lastRound && b.rest > 0) {
          st.push({ kind: 'rest', dur: b.rest, round: r, rounds: b.rounds, block: bi + 1, blocks: n,
            label: b.restLabel, title: 'Pausa' });
        } else if (lastRound && !lastBlock) {
          const d = c.blockRest > 0 ? c.blockRest : b.rest;
          if (d > 0) st.push({ kind: 'rest', dur: d, block: bi + 1, blocks: n, label: '', title: 'Pausa entre blocos' });
        }
      }
    });
  } else if (c.mode === 'emom') {
    for (let r = 1; r <= c.emom.rounds; r++) {
      const label = c.emom.labels.length ? c.emom.labels[(r - 1) % c.emom.labels.length] : '';
      st.push({ kind: 'work', dur: c.emom.every, round: r, rounds: c.emom.rounds, label, title: 'EMOM' });
    }
  } else if (c.mode === 'amrap') {
    st.push({ kind: 'work', dur: c.amrap.min * 60, counter: true, label: '', title: 'AMRAP' });
  } else {
    st.push({ kind: 'work', dur: c.fortime.capMin ? c.fortime.capMin * 60 : null, counter: true,
      countUp: true, target: c.fortime.rounds, label: '', title: 'For time' });
  }
  return st;
}

/* Duração prevista sem a preparação: {total (s) dos passos com tempo, open = nº de passos livres}. */
function timerPlannedSec(c) {
  const steps = buildTimerSteps(Object.assign({}, c, { prep: 0 }));
  let total = 0;
  let open = 0;
  steps.forEach((s) => { if (s.dur == null) open++; else total += s.dur; });
  return { total, open };
}

function tfmt(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}

/* Resumo curto de uma configuração (para listas e para a biblioteca). */
function timerSummary(cfg) {
  const c = normalizeTimer(cfg);
  if (c.mode === 'emom') return 'EMOM ' + c.emom.rounds + ' × ' + tfmt(c.emom.every);
  if (c.mode === 'amrap') return 'AMRAP ' + c.amrap.min + '\'';
  if (c.mode === 'fortime') {
    return 'For time' + (c.fortime.rounds ? ' · ' + c.fortime.rounds + ' rondas' : '') +
      (c.fortime.capMin ? ' · limite ' + c.fortime.capMin + '\'' : '');
  }
  return c.blocks.map((b) => b.rounds + ' × ' + (b.work ? tfmt(b.work) : 'livre') +
    (b.rest ? ' / ' + tfmt(b.rest) : '')).join(' + ');
}

/* ---------- Som, vibração e ecrã ligado ---------- */

function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {
    audioCtx = null;
  }
}

function tone(freq, ms, delayMs, vol) {
  if (!timerCfg || !timerCfg.sound || !audioCtx) return;
  try {
    const t0 = audioCtx.currentTime + (delayMs || 0) / 1000;
    const len = ms / 1000;
    const v = vol || 0.25;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'square';   // corta melhor o barulho do ginásio do que um seno
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.01);
    g.gain.setValueAtTime(v, t0 + Math.max(len - 0.03, 0.02));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + len + 0.02);
  } catch (e) { /* sem som não é motivo para parar o timer */ }
}

function buzz(pattern) {
  if (!timerCfg || !timerCfg.vibrate || !navigator.vibrate) return;
  // Sem um toque no ecrã o browser recusa (e queixa-se na consola).
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try { navigator.vibrate(pattern); } catch (e) { /* ignorado */ }
}

const cue = {
  count() { tone(880, 130); buzz(60); },
  work() { tone(1320, 480); buzz(320); },
  rest() { tone(660, 260); tone(660, 260, 340); buzz([150, 100, 150]); },
  lap() { tone(990, 90); buzz(40); },
  end() { tone(1320, 200); tone(1320, 200, 260); tone(1760, 700, 520); buzz([300, 120, 300, 120, 500]); }
};

async function acquireWake() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) {
    wakeLock = null;
  }
}

function releaseWake() {
  try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignorado */ }
  wakeLock = null;
}

/* ---------- Abrir / fechar ---------- */

async function openTimer(opts) {
  opts = opts || {};
  // O timer é independente: volta ao separador de onde foi aberto.
  timerReturnTab = currentTab() || 'treino';
  timerPresetId = opts.presetId || null;
  const last = await DB.getSetting('timerLast', null);
  const base = normalizeTimer(last);
  // Som e vibração são preferências: ficam como estavam da última vez.
  timerCfg = normalizeTimer(Object.assign({}, opts.cfg || base, { sound: base.sound, vibrate: base.vibrate, prep: base.prep, tapCount: base.tapCount }));
  tr = null;
  showOnly('#view-timer');
  showTimerPart('setup');
  renderTimerSetup();
}

function closeTimer() {
  if (tr && !tr.done && !confirm('Parar o timer?')) return;
  stopTimerLoop();
  tr = null;
  switchTab(timerReturnTab);
}

function showTimerPart(part) {
  $('#timer-setup').hidden = part !== 'setup';
  $('#timer-run').hidden = part !== 'run';
  $('#timer-summary').hidden = part !== 'summary';
}

/* ---------- Configuração ---------- */

function renderTimerSetup() {
  const c = timerCfg;
  document.querySelectorAll('#t-mode .seg').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.mode === c.mode);
  });
  ['intervals', 'emom', 'amrap', 'fortime'].forEach((m) => { $('#t-mode-' + m).hidden = m !== c.mode; });

  // Atalhos
  const quick = $('#timer-quick');
  quick.innerHTML = '';
  TIMER_QUICK.forEach((q) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-secondary';
    b.textContent = q.label;
    b.addEventListener('click', () => {
      timerCfg = normalizeTimer(Object.assign({}, timerCfg, cloneJSON(q.cfg)));
      timerPresetId = null;
      renderTimerSetup();
    });
    quick.appendChild(b);
  });

  // Presets e biblioteca que trazem timer
  const sel = $('#t-preset');
  sel.innerHTML = '<option value="">Carregar de um treino…</option>';
  const mine = presetsCache.filter((p) => presetTimer(p));
  if (mine.length) {
    const g = document.createElement('optgroup');
    g.label = 'Os meus presets';
    mine.forEach((p) => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name;
      g.appendChild(o);
    });
    sel.appendChild(g);
  }
  const lib = libraryNotImported();
  if (lib.length) {
    const g = document.createElement('optgroup');
    g.label = 'Biblioteca';
    lib.forEach((w) => {
      const o = document.createElement('option');
      o.value = 'lib:' + w.key;
      o.textContent = w.name;
      g.appendChild(o);
    });
    sel.appendChild(g);
  }
  const cur = canonicalPresetId(timerPresetId);
  sel.value = cur && Array.from(sel.options).some((o) => o.value === cur) ? cur : '';

  // Intervalos: blocos
  const host = $('#t-blocks');
  host.innerHTML = '';
  c.blocks.forEach((b, i) => {
    const row = document.createElement('div');
    row.className = 't-block';
    row.innerHTML =
      '<div class="t-block-head"><b>Bloco ' + (i + 1) + '</b>' +
      (c.blocks.length > 1 ? '<button type="button" class="set-remove" data-act="del" aria-label="Apagar bloco ' + (i + 1) + '">×</button>' : '') +
      '</div>' +
      '<div class="row-3">' +
      '<label class="field"><span class="label">Rondas</span><input type="number" inputmode="numeric" min="1" data-k="rounds" value="' + b.rounds + '"></label>' +
      '<label class="field"><span class="label">Trabalho <em>seg</em></span><input type="number" inputmode="numeric" min="0" data-k="work" value="' + b.work + '"></label>' +
      '<label class="field"><span class="label">Pausa <em>seg</em></span><input type="number" inputmode="numeric" min="0" data-k="rest" value="' + b.rest + '"></label>' +
      '</div>' +
      '<label class="field"><span class="label">Exercícios <em>opcional, separados por vírgula; rodam a cada ronda</em></span>' +
      '<input type="text" data-k="labels" placeholder="ex.: 200 m  ou  Prancha, Polichinelo" value="' + escapeHtml(b.labels.join(', ')) + '"></label>';
    row.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('input', () => {
        const k = inp.dataset.k;
        if (k === 'labels') b.labels = inp.value.split(',').map((s) => s.trim()).filter(Boolean);
        else b[k] = Number(inp.value);
        timerPresetId = null;
        renderTimerTotal();
      });
    });
    const del = row.querySelector('[data-act="del"]');
    if (del) del.addEventListener('click', () => { c.blocks.splice(i, 1); renderTimerSetup(); });
    host.appendChild(row);
  });
  $('#t-block-rest').value = c.blockRest;
  $('#t-block-rest-field').hidden = c.blocks.length < 2;

  $('#t-emom-every').value = c.emom.every;
  $('#t-emom-rounds').value = c.emom.rounds;
  $('#t-emom-labels').value = c.emom.labels.join(', ');
  $('#t-amrap-min').value = c.amrap.min;
  $('#t-ft-cap').value = c.fortime.capMin || '';
  $('#t-ft-rounds').value = c.fortime.rounds || '';
  $('#t-prep').value = c.prep;
  $('#t-sound').checked = c.sound;
  $('#t-vibrate').checked = c.vibrate;
  $('#t-tap').checked = c.tapCount;
  renderTimerTotal();
}

/* Lê os campos simples (os blocos actualizam-se ao escrever). */
function readTimerFields() {
  const c = timerCfg;
  c.blockRest = Number($('#t-block-rest').value) || 0;
  c.emom.every = Number($('#t-emom-every').value) || 60;
  c.emom.rounds = Number($('#t-emom-rounds').value) || 1;
  c.emom.labels = $('#t-emom-labels').value.split(',').map((s) => s.trim()).filter(Boolean);
  c.amrap.min = Number($('#t-amrap-min').value) || 1;
  c.fortime.capMin = Number($('#t-ft-cap').value) || null;
  c.fortime.rounds = Number($('#t-ft-rounds').value) || null;
  c.prep = Number($('#t-prep').value) || 0;
  c.sound = $('#t-sound').checked;
  c.vibrate = $('#t-vibrate').checked;
  c.tapCount = $('#t-tap').checked;
}

function renderTimerTotal() {
  const c = normalizeTimer(timerCfg);
  const out = $('#t-total');
  if (c.mode === 'fortime') {
    out.textContent = c.fortime.capMin ? 'Limite de ' + tfmt(c.fortime.capMin * 60) + '.' : 'Cronómetro sem limite: carregas em Terminei no fim.';
    return;
  }
  const p = timerPlannedSec(c);
  out.textContent = p.open
    ? 'Pausas e trabalho com tempo: ' + tfmt(p.total) + ', mais ' + p.open + (p.open === 1 ? ' esforço livre' : ' esforços livres') + ' ao teu ritmo.'
    : 'Duração: ' + tfmt(p.total) + (c.prep ? ' (mais ' + c.prep + ' s para te preparares)' : '') + '.';
}

/* ---------- Corrida ---------- */

function startTimer() {
  readTimerFields();
  timerCfg = normalizeTimer(timerCfg);
  unlockAudio();   // tem de ser no toque do botão, senão o Android cala o som
  const save = cloneJSON(timerCfg);
  DB.setSetting('timerLast', save);

  const t = performance.now();
  tr = { steps: buildTimerSteps(timerCfg), i: -1, stepStart: t, activeStart: null,
    pausedAt: null, laps: [], workDone: 0, lastCount: null, done: false, totalMs: 0, capped: false };
  showTimerPart('run');
  enterStep(0, t);
  acquireWake();
  stopTimerLoop();
  timerInterval = setInterval(tickTimer, 100);
  renderTimerRun(t);
}

function stopTimerLoop() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  releaseWake();
}

function enterStep(i, t) {
  const prev = tr.steps[tr.i];
  if (prev && prev.kind === 'work' && !prev.counter) tr.workDone++;
  if (i >= tr.steps.length) { finishTimer(t, true); return; }
  tr.i = i;
  tr.stepStart = t;
  tr.lastCount = null;
  const s = tr.steps[i];
  if (s.kind !== 'prep' && tr.activeStart == null) tr.activeStart = t;
  if (s.kind === 'work') cue.work();
  else if (s.kind === 'rest') cue.rest();
}

function tickTimer() {
  if (!tr || tr.done || tr.pausedAt != null) return;
  const t = performance.now();
  let s = tr.steps[tr.i];
  // Se a página esteve parada, avança os passos que já passaram.
  while (s && s.dur != null && t - tr.stepStart >= s.dur * 1000) {
    const boundary = tr.stepStart + s.dur * 1000;
    if (s.counter) tr.capped = true;
    enterStep(tr.i + 1, boundary);
    if (tr.done) return;
    s = tr.steps[tr.i];
  }
  if (s.dur != null && s.dur >= 5) {
    const rem = Math.ceil((s.dur * 1000 - (t - tr.stepStart)) / 1000);
    if (rem >= 1 && rem <= 3 && rem !== tr.lastCount) {
      tr.lastCount = rem;
      cue.count();
    }
  }
  renderTimerRun(t);
}

function timerMain() {
  if (!tr || tr.done) return;
  const t = performance.now();
  if (tr.pausedAt != null) return;
  const s = tr.steps[tr.i];
  if (s.counter) {
    tr.laps.push(t - tr.activeStart);
    cue.lap();
    if (s.target && tr.laps.length >= s.target) { finishTimer(t, true); return; }
  } else if (s.dur == null) {
    enterStep(tr.i + 1, t);
    if (tr.done) return;
  }
  renderTimerRun(t);
}

/* Toque em qualquer parte do ecrã do timer (fora dos botões).
 * Num passo com contador ou livre faz o mesmo que o botão grande;
 * num passo com tempo (intervalos, EMOM) conta uma ronda à parte. */
function timerTap(ev) {
  if (!tr || tr.done || tr.pausedAt != null || !timerCfg.tapCount) return;
  if (ev.target.closest('button, a, input, select')) return;
  const s = tr.steps[tr.i];
  if (!s || s.kind === 'prep') return;
  const t = performance.now();
  if (t - lastTapAt < 600) return;   // um toque duplo não conta duas rondas
  lastTapAt = t;
  const run = $('#timer-run');
  run.classList.remove('is-tap');
  void run.offsetWidth;
  run.classList.add('is-tap');
  setTimeout(() => run.classList.remove('is-tap'), 200);
  if (s.counter || s.dur == null) { timerMain(); return; }
  tr.laps.push(t - tr.activeStart);
  cue.lap();
  renderTimerRun(t);
}

function timerPause() {
  if (!tr || tr.done) return;
  const t = performance.now();
  if (tr.pausedAt == null) {
    tr.pausedAt = t;
    releaseWake();
  } else {
    const d = t - tr.pausedAt;
    tr.stepStart += d;
    if (tr.activeStart != null) tr.activeStart += d;
    tr.pausedAt = null;
    acquireWake();
  }
  renderTimerRun(t);
}

function timerSkip() {
  if (!tr || tr.done || tr.pausedAt != null) return;
  const t = performance.now();
  enterStep(tr.i + 1, t);
  if (!tr.done) renderTimerRun(t);
}

function timerStop() {
  if (!tr || tr.done) return;
  const s = tr.steps[tr.i];
  const isFinish = s && s.counter && s.countUp;
  if (!isFinish && !confirm('Terminar já? Fica registado o que fizeste até aqui.')) return;
  const t = tr.pausedAt != null ? tr.pausedAt : performance.now();
  finishTimer(t, isFinish);
}

function finishTimer(t, natural) {
  if (tr.done) return;
  tr.done = true;
  tr.natural = natural;
  tr.totalMs = tr.activeStart != null ? Math.max(t - tr.activeStart, 0) : 0;
  stopTimerLoop();
  cue.end();
  renderTimerSummary();
}

function renderTimerRun(t) {
  if (!tr || tr.done) return;
  const s = tr.steps[tr.i];
  const now = tr.pausedAt != null ? tr.pausedAt : t;
  const el = now - tr.stepStart;
  const run = $('#timer-run');
  run.className = 'timer-run is-' + s.kind + (tr.pausedAt != null ? ' is-paused' : '');

  $('#tr-phase').textContent = tr.pausedAt != null ? 'Em pausa' : s.title;
  $('#tr-label').textContent = s.label || '';
  $('#tr-clock').textContent = (s.dur != null && !s.countUp) ? tfmt(Math.ceil((s.dur * 1000 - el) / 1000)) : tfmt(Math.floor(el / 1000));
  $('#tr-bar').style.width = s.dur != null ? Math.min(100, (el / (s.dur * 1000)) * 100) + '%' : '0';

  let round = '';
  if (s.counter) round = 'Rondas: ' + tr.laps.length + (s.target ? ' / ' + s.target : '');
  else if (s.round) round = 'Ronda ' + s.round + ' / ' + s.rounds + (s.blocks > 1 ? ' · Bloco ' + s.block + ' / ' + s.blocks : '');
  else if (s.blocks > 1) round = 'Bloco ' + s.block + ' / ' + s.blocks;
  if (!s.counter && tr.laps.length) round += (round ? ' · ' : '') + 'Contadas: ' + tr.laps.length;
  $('#tr-round').textContent = round;
  $('#tr-tap-hint').hidden = !timerCfg.tapCount || s.kind === 'prep' || tr.pausedAt != null;
  $('#tr-tap-hint').textContent = s.dur == null && !s.counter
    ? 'Toca em qualquer parte do ecrã quando acabares'
    : 'Toca em qualquer parte do ecrã para contar uma ronda';
  $('#tr-total').textContent = tr.activeStart != null ? 'Total ' + tfmt(Math.floor((now - tr.activeStart) / 1000)) : '';

  const next = tr.steps[tr.i + 1];
  $('#tr-next').textContent = next
    ? 'A seguir: ' + next.title.toLowerCase() + (next.label ? ' · ' + next.label : '') + (next.dur != null ? ' ' + tfmt(next.dur) : '')
    : (s.kind === 'prep' ? '' : 'Último!');

  const laps = $('#tr-laps');
  if (tr.laps.length) {
    const parts = tr.laps.map((ms, k) => 'R' + (k + 1) + ' ' + tfmt((ms - (k ? tr.laps[k - 1] : 0)) / 1000));
    laps.textContent = parts.slice(-4).join('  ·  ');
  } else laps.textContent = '';

  const main = $('#btn-tr-main');
  if (s.counter) { main.hidden = false; main.textContent = '+1 ronda'; }
  else if (s.dur == null) { main.hidden = false; main.textContent = 'Feito ✓'; }
  else main.hidden = true;
  main.disabled = tr.pausedAt != null;

  $('#btn-tr-pause').textContent = tr.pausedAt != null ? 'Retomar' : 'Pausa';
  $('#btn-tr-skip').hidden = !!s.counter;
  $('#btn-tr-stop').textContent = s.counter && s.countUp ? 'Terminei' : 'Terminar';
}

function renderTimerSummary() {
  showTimerPart('summary');
  const c = timerCfg;
  const total = tr.totalMs / 1000;
  const rows = [['Tempo total', tfmt(total)]];
  if (c.mode === 'amrap' || c.mode === 'fortime') {
    rows.push(['Rondas', String(tr.laps.length) + (c.fortime.rounds && c.mode === 'fortime' ? ' / ' + c.fortime.rounds : '')]);
    if (c.mode === 'fortime' && tr.capped) rows.push(['Resultado', 'Bateu no limite']);
  } else {
    const planned = tr.steps.filter((s) => s.kind === 'work').length;
    rows.push(['Rondas do timer', tr.workDone + ' / ' + planned]);
    if (tr.laps.length) rows.push(['Rondas contadas (toques)', String(tr.laps.length)]);
  }
  $('#ts-title').textContent = tr.natural ? 'Feito!' : 'Terminado';
  $('#ts-stats').innerHTML = rows.map((r) => '<div class="ts-row"><span>' + r[0] + '</span><b>' + escapeHtml(r[1]) + '</b></div>').join('');
  $('#ts-laps').innerHTML = tr.laps.length
    ? '<p class="hint">Parciais</p><div class="ts-laps">' + tr.laps.map((ms, k) =>
        '<span>R' + (k + 1) + ' <b>' + tfmt((ms - (k ? tr.laps[k - 1] : 0)) / 1000) + '</b></span>').join('') + '</div>'
    : '';
}

/* Só quando o utilizador diz que sim: cria um registo novo com a duração e,
 * conforme o modo, o tempo ou as rondas do WOD. Se o timer veio de um treino
 * (preset ou biblioteca), o WOD desse treino entra também. */
async function timerToEditor() {
  const c = timerCfg;
  const res = { totalSec: Math.round(tr.totalMs / 1000), laps: tr.laps.length, capped: tr.capped };
  await openEditor(null);
  if (timerPresetId) await applyPreset(timerPresetId);
  if (res.laps && c.mode !== 'amrap' && c.mode !== 'fortime') {
    $('#f-notes').value = 'Timer: ' + res.laps + ' rondas contadas.';
  }
  const empty = !$('#f-wod-name').value.trim() && !wodMovements.length;
  $('#f-duration').value = Math.max(1, Math.round(res.totalSec / 60));
  if (c.mode === 'fortime') {
    if (empty || $('#f-wod-format').value === 'other') $('#f-wod-format').value = 'forTime';
    if ($('#f-wod-format').value === 'forTime') {
      $('#f-wod-min').value = Math.floor(res.totalSec / 60);
      $('#f-wod-sec').value = res.totalSec % 60;
      if (c.fortime.capMin && !$('#f-wod-cap').value) $('#f-wod-cap').value = c.fortime.capMin;
    }
  } else if (c.mode === 'amrap') {
    if (empty || $('#f-wod-format').value === 'other') $('#f-wod-format').value = 'amrap';
    if ($('#f-wod-format').value === 'amrap') {
      $('#f-wod-rounds').value = res.laps;
      $('#f-wod-cap').value = c.amrap.min;
    }
  } else if (c.mode === 'emom' && empty) {
    $('#f-wod-format').value = 'emom';
    $('#f-wod-cap').value = Math.round(c.emom.every * c.emom.rounds / 60);
  }
  refreshWodFields();
  tr = null;
  showOnly('#view-editor');
  toast('Registo novo com o resultado do timer · revê e guarda');
}

function bindTimerEvents() {
  $('#btn-open-timer').addEventListener('click', () => openTimer());
  $('#btn-timer-close').addEventListener('click', closeTimer);
  $('#timer-run').addEventListener('pointerdown', timerTap);
  document.querySelectorAll('#t-mode .seg').forEach((b) => {
    b.addEventListener('click', () => {
      readTimerFields();
      timerCfg.mode = b.dataset.mode;
      timerPresetId = null;
      renderTimerSetup();
    });
  });
  $('#t-preset').addEventListener('change', (ev) => {
    const id = ev.target.value;
    if (!id) return;
    const p = id.startsWith('lib:') ? libraryPreset(id) : presetsCache.find((x) => x.id === id);
    const cfg = p && presetTimer(p);
    if (!cfg) return;
    readTimerFields();
    timerCfg = normalizeTimer(Object.assign({}, cloneJSON(cfg), { prep: timerCfg.prep, sound: timerCfg.sound, vibrate: timerCfg.vibrate, tapCount: timerCfg.tapCount }));
    timerPresetId = id;
    renderTimerSetup();
  });
  $('#btn-t-add-block').addEventListener('click', () => {
    readTimerFields();
    const last = timerCfg.blocks[timerCfg.blocks.length - 1];
    timerCfg.blocks.push({ rounds: last.rounds, work: last.work, rest: last.rest, labels: [], restLabel: '' });
    timerPresetId = null;
    renderTimerSetup();
  });
  ['#t-block-rest', '#t-emom-every', '#t-emom-rounds', '#t-amrap-min', '#t-ft-cap', '#t-ft-rounds', '#t-prep'].forEach((sel) => {
    $(sel).addEventListener('input', () => { readTimerFields(); renderTimerTotal(); });
  });
  $('#t-emom-labels').addEventListener('input', readTimerFields);
  $('#t-sound').addEventListener('change', readTimerFields);
  $('#t-vibrate').addEventListener('change', readTimerFields);
  $('#t-tap').addEventListener('change', readTimerFields);
  $('#btn-t-test').addEventListener('click', () => { readTimerFields(); unlockAudio(); cue.work(); });
  $('#btn-t-start').addEventListener('click', startTimer);
  $('#btn-tr-main').addEventListener('click', timerMain);
  $('#btn-tr-pause').addEventListener('click', timerPause);
  $('#btn-tr-skip').addEventListener('click', timerSkip);
  $('#btn-tr-stop').addEventListener('click', timerStop);
  $('#btn-ts-use').addEventListener('click', timerToEditor);
  $('#btn-ts-again').addEventListener('click', () => { showTimerPart('setup'); renderTimerSetup(); });
  $('#btn-ts-close').addEventListener('click', closeTimer);

  // De volta ao ecrã: recupera o ecrã ligado e acerta logo o relógio.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !tr || tr.done) return;
    if (tr.pausedAt == null && (!wakeLock || wakeLock.released)) acquireWake();
    tickTimer();
  });
}
