/* potential.js — composição corporal e força esperada para o teu corpo.
 *
 * 1. Massa magra = peso × (1 − % de gordura). A % vem só das medidas do
 *    corpo, pela RFM (altura e cintura). A % da balança fica registada mas
 *    não entra nas contas. A massa muscular esquelética anda pelos 52% da
 *    massa magra nos homens e 46% nas mulheres.
 * 2. Padrões de força: múltiplos do peso corporal por nível, definidos para
 *    um atleta de referência (80 kg homem / 60 kg mulher, ~15% de gordura).
 * 3. A força cresce com a massa magra, mas não em linha recta: escala com a
 *    massa elevada a 2/3 (escala alométrica, a mesma usada para comparar
 *    halterofilistas de categorias diferentes). A gordura não levanta peso,
 *    por isso o cálculo usa a massa magra e não o peso total.
 *
 * Isto dá uma referência, não um limite: técnica, anos de treino e
 * genética pesam tanto como a massa. Carregado antes do app.js. */

const LEVELS = ['Iniciante', 'Novato', 'Intermédio', 'Avançado', 'Elite'];

/* Múltiplos do peso corporal (1RM) para o atleta de referência masculino.
 * Para mulheres aplica-se um factor (ver STANDARD_F). */
const STANDARDS = {
  'Back Squat':      [0.75, 1.25, 1.5, 2.25, 2.75],
  'Front Squat':     [0.6, 1.0, 1.25, 1.75, 2.25],
  'Overhead Squat':  [0.4, 0.7, 1.0, 1.4, 1.75],
  'Deadlift':        [1.0, 1.5, 2.0, 2.5, 3.0],
  'Bench Press':     [0.5, 0.75, 1.25, 1.75, 2.0],
  'Strict Press':    [0.35, 0.55, 0.8, 1.05, 1.35],
  'Push Press':      [0.45, 0.7, 1.0, 1.3, 1.6],
  'Push Jerk':       [0.5, 0.8, 1.1, 1.45, 1.75],
  'Jerk':            [0.5, 0.8, 1.1, 1.45, 1.75],
  'Split Jerk':      [0.5, 0.8, 1.1, 1.45, 1.75],
  'Power Clean':     [0.5, 0.8, 1.1, 1.4, 1.7],
  'Hang Power Clean':[0.45, 0.75, 1.0, 1.3, 1.6],
  'Clean':           [0.55, 0.9, 1.2, 1.55, 1.85],
  'Clean and Jerk':  [0.5, 0.85, 1.15, 1.5, 1.8],
  'Power Snatch':    [0.4, 0.6, 0.85, 1.1, 1.35],
  'Snatch':          [0.4, 0.65, 0.9, 1.2, 1.5],
  'Thruster':        [0.45, 0.7, 0.95, 1.2, 1.5],
  'Bent Over Row':   [0.5, 0.75, 1.0, 1.5, 1.75]
};

/* Movimentos com o peso do corpo: repetições seguidas por nível. */
const STANDARDS_REPS = {
  'Pull-up':        [1, 5, 12, 20, 30],
  'Strict Pull Up': [1, 5, 12, 20, 30],
  'Ring Dip':       [1, 5, 12, 20, 30],
  'Push-up':        [5, 15, 30, 45, 60]
};

const STANDARD_F = { lower: 0.75, upper: 0.6 };
const UPPER = /press|bench|jerk|row|snatch/i;

/* % de gordura pela RFM — massa gorda relativa (Woolcott & Bergman, 2018),
 * ajustada a medições por DXA. Só altura e cintura, na mesma unidade:
 *   homens   64 − 20 × (altura ÷ cintura)
 *   mulheres 76 − 20 × (altura ÷ cintura)
 * Cada cm de cintura vale ≈0,45 pontos: mede sempre à altura do umbigo,
 * relaxado, no fim da expiração. Devolve null sem cintura ou altura. */
function rfmBodyFat(measures, heightCm, sex) {
  if (!measures || !measures.waist || !heightCm) return null;
  return (sex === 'f' ? 76 : 64) - 20 * (heightCm / measures.waist);
}

/* Medição mais recente com a cintura registada. */
function latestMeasureEntry(body) {
  return body.find((b) => b.measures && b.measures.waist) || null;
}

let potentialCtx = null;   // perfil real, para a simulação partir dele
let potentialSim = null;   // { weight, fat } escolhidos nos controlos

async function buildPotentialContext(allSets, dateBySession) {
  const [body, heightCm, birthYear, sex] = await Promise.all([
    DB.getBodyMetrics(), DB.getSetting('heightCm', 0), DB.getSetting('birthYear', 0), DB.getSetting('sex', '')
  ]);
  const withW = body.filter((b) => b.weightKg != null);
  if (!withW.length) return { ok: false, reason: 'Regista uma pesagem no separador Corpo.' };
  const weight = withW[0].weightKg;

  // A gordura vem só da RFM (altura e cintura). O valor da balança de
  // bioimpedância fica registado mas não entra nas contas: varia muito com a
  // hidratação.
  if (!Number(heightCm)) return { ok: false, reason: 'Falta a altura em Definições → Perfil.' };
  const entry = latestMeasureEntry(body);
  const fat = entry ? rfmBodyFat(entry.measures, Number(heightCm), sex) : null;
  if (fat == null) {
    return { ok: false, reason: 'Regista a cintura numa medição (separador Corpo) para calcular a gordura.' };
  }
  const fatSource = 'RFM (altura ' + Number(heightCm) + ' ÷ cintura ' + dec(entry.measures.waist) +
    '), medidas de ' + prettyDate(entry.date);
  const scale = body.find((b) => b.bodyFatPct != null);

  // Melhor 1RM estimado (ou repetições) por movimento.
  const best = {};
  const bestKind = {};   // 'rm' (medido) ou 'est'/'pct' (estimado)
  allSets.forEach((s) => {
    if (s.warmup || !(s.reps > 0) || !dateBySession[s.sessionId]) return;
    const name = exerciseName(s.exerciseId);
    if (STANDARDS[name] && s.weightKg > 0) {
      const v = setE1rm(s);
      if (!best[name] || v > best[name]) { best[name] = v; bestKind[name] = s._kind; }
    } else if (STANDARDS_REPS[name] && !(s.weightKg > 0)) {
      if (!best[name] || s.reps > best[name]) best[name] = s.reps;
    }
  });
  // Os RM registados são medidos: substituem sempre as estimativas.
  Object.keys(prMap).forEach((id) => {
    const name = exerciseName(id);
    const kg = prMap[id].kg;
    if (STANDARDS[name]) {
      best[name] = kg;
      bestKind[name] = 'rm';
    }
  });

  return {
    ok: true, weight: weight, fat: fat, fatSource: fatSource,
    scaleFat: scale ? scale.bodyFatPct : null,
    sex: sex || 'm', best: best, bestKind: bestKind
  };
}

function composition(weight, fat, sex) {
  const lean = weight * (1 - fat / 100);
  return {
    lean: lean,
    fatKg: weight - lean,
    muscle: lean * (sex === 'f' ? 0.46 : 0.52),
    // Massa "efectiva": o peso que terias com esta massa magra a 15% de gordura.
    eff: lean / 0.85
  };
}

/* Carga esperada para um nível, ajustada à massa magra (expoente 2/3). */
function expectedKg(name, levelIdx, comp, sex) {
  const ref = sex === 'f' ? 60 : 80;
  let ratio = STANDARDS[name][levelIdx];
  if (sex === 'f') ratio *= UPPER.test(name) ? STANDARD_F.upper : STANDARD_F.lower;
  return ratio * ref * Math.pow(comp.eff / ref, 2 / 3);
}

/* Repetições esperadas: puxar o próprio corpo depende da força relativa,
 * que desce quando o peso sobe sem massa magra a acompanhar. */
function expectedReps(name, levelIdx, comp, weight, sex) {
  const ref = sex === 'f' ? 60 : 80;
  const rel = Math.pow(comp.eff / ref, 2 / 3) * ref / weight;   // 1 no atleta de referência
  return Math.max(0, STANDARDS_REPS[name][levelIdx] * Math.pow(rel, 2));
}

/* Posição contínua entre níveis: 2,5 = a meio entre Intermédio e Avançado. */
function levelScore(value, thresholds) {
  if (value < thresholds[0]) return Math.max(0, value / thresholds[0]) - 1 + 0;  // abaixo de iniciante
  for (let i = 0; i < thresholds.length - 1; i++) {
    if (value < thresholds[i + 1]) return i + (value - thresholds[i]) / (thresholds[i + 1] - thresholds[i]);
  }
  return thresholds.length - 1;
}

function levelLabel(score) {
  if (score < 0) return 'Abaixo de iniciante';
  return LEVELS[Math.min(LEVELS.length - 1, Math.floor(score + 0.0001))];
}

async function renderPotentialSection(allSets, dateBySession) {
  potentialCtx = await buildPotentialContext(allSets, dateBySession);
  const ctx = potentialCtx;
  $('#potential-controls').hidden = !ctx.ok;
  if (!ctx.ok) {
    $('#comp-tiles').innerHTML = '';
    $('#potential-table').querySelector('tbody').innerHTML =
      '<tr><td colspan="5" class="table-empty">' + escapeHtml(ctx.reason) + '</td></tr>';
    $('#potential-hint').textContent = '';
    return;
  }
  if (!potentialSim) potentialSim = { weight: ctx.weight, fat: ctx.fat };
  drawPotential();
}

function round05(v) { return Math.round(v * 2) / 2; }

function drawPotential() {
  const ctx = potentialCtx;
  if (!ctx || !ctx.ok) return;
  const sim = potentialSim;
  const real = composition(ctx.weight, ctx.fat, ctx.sex);
  const simulating = Math.abs(sim.weight - ctx.weight) > 0.25 || Math.abs(sim.fat - ctx.fat) > 0.25;
  // Sem simulação usam-se os valores exactos, não os arredondados do controlo.
  const shownW = simulating ? sim.weight : ctx.weight;
  const shownF = simulating ? sim.fat : ctx.fat;
  const now = simulating ? composition(sim.weight, sim.fat, ctx.sex) : real;

  $('#sim-w').value = sim.weight;
  $('#sim-f').value = sim.fat;
  $('#sim-w-out').textContent = dec(shownW) + ' kg';
  $('#sim-f-out').textContent = dec(shownF) + '%';
  $('#sim-lean-out').textContent = 'Massa magra ' + dec(now.lean) + ' kg (' + signed(now.lean - real.lean) + ')';

  // Nível geral: média das posições nos movimentos que fazes.
  const scores = [];
  Object.keys(ctx.best).forEach((name) => {
    const thr = STANDARDS[name]
      ? STANDARDS[name].map((_, i) => expectedKg(name, i, real, ctx.sex))
      : STANDARDS_REPS[name].map((_, i) => expectedReps(name, i, real, ctx.weight, ctx.sex));
    scores.push(levelScore(ctx.best[name], thr));
  });
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  const tiles = [
    ['Massa magra', dec(now.lean), 'kg' + (simulating ? ' (' + signed(now.lean - real.lean) + ')' : '')],
    ['Músculo', dec(now.muscle), 'kg esquelético (≈)'],
    ['Gordura', dec(now.fatKg), 'kg · ' + dec(shownF) + '%'],
    ['Nível de força', avgScore == null ? '—' : levelLabel(avgScore), avgScore == null ? 'sem dados' : 'média de ' + scores.length + ' movimentos']
  ];
  $('#comp-tiles').innerHTML = tiles.map(([l, v, u]) =>
    '<div class="tile"><span class="tile-label">' + escapeHtml(l) + '</span>' +
    '<span class="tile-value' + (l === 'Nível de força' ? ' small-value' : '') + '">' + escapeHtml(v) + '</span>' +
    '<span class="tile-unit">' + escapeHtml(u) + '</span></div>'
  ).join('');

  // Tabela: movimentos que fazes primeiro, depois os básicos que não fazes.
  const names = Object.keys(STANDARDS).concat(Object.keys(STANDARDS_REPS))
    .filter((n, i, arr) => arr.indexOf(n) === i && !(n === 'Pull-up' && ctx.best['Strict Pull Up'] != null));
  names.sort((a, b) => (ctx.best[b] != null) - (ctx.best[a] != null));

  const rows = names.map((name) => {
    const isReps = !STANDARDS[name];
    const thrReal = isReps
      ? STANDARDS_REPS[name].map((_, i) => expectedReps(name, i, real, ctx.weight, ctx.sex))
      : STANDARDS[name].map((_, i) => expectedKg(name, i, real, ctx.sex));
    const thrSim = isReps
      ? STANDARDS_REPS[name].map((_, i) => expectedReps(name, i, now, sim.weight, ctx.sex))
      : STANDARDS[name].map((_, i) => expectedKg(name, i, now, ctx.sex));
    const mine = ctx.best[name];
    const fmt = (v) => isReps ? Math.round(v) + ' reps' : Math.round(v) + ' kg';

    let youCell = '<span class="muted">—</span>';
    let levelCell = '<span class="muted">não fazes</span>';
    if (mine != null) {
      const score = levelScore(mine, thrReal);
      // Tu simulado: mesmo nível relativo, com a nova massa.
      const simMine = isReps
        ? mine * (thrSim[2] / thrReal[2])
        : mine * Math.pow(now.eff / real.eff, 2 / 3);
      youCell = simulating
        ? fmt(mine) + ' <span class="arrow">→</span> <b>' + fmt(simMine) + '</b>'
        : '<b>' + fmt(mine) + '</b>';
      if (!isReps) {
        youCell = (ctx.bestKind[name] === 'rm' ? '<span class="rm-badge">RM</span> ' : '≈') + youCell;
      }
      levelCell = '<span class="lvl lvl-' + Math.max(0, Math.min(4, Math.floor(score))) + '">' +
        escapeHtml(levelLabel(score)) + '</span>';
    }
    return '<tr' + (mine == null ? ' class="dim-row"' : '') + '>' +
      '<td>' + escapeHtml(name) + '</td>' +
      '<td>' + youCell + '</td>' +
      '<td>' + levelCell + '</td>' +
      '<td>' + fmt(thrSim[2]) + '</td>' +
      '<td>' + fmt(thrSim[3]) + '</td></tr>';
  });
  $('#potential-table').querySelector('tbody').innerHTML = rows.join('');

  // A balança fica só como referência, fora das contas.
  const crossCheck = ctx.scaleFat != null
    ? ' A balança indicava ' + dec(ctx.scaleFat) + '% (não usado).'
    : '';
  $('#potential-hint').textContent =
    'Gordura ' + dec(ctx.fat) + '%, ' + ctx.fatSource + '.' + crossCheck +
    ' Intermédio e Avançado são as cargas típicas para a tua massa magra' + (simulating ? ' simulada' : '') +
    ' (anos de treino consistente; Avançado é raro sem 5+ anos). A força cresce com a massa magra elevada a 2/3: ' +
    'perder gordura quase não mexe nas cargas, mas melhora tudo o que levanta o próprio corpo. ' +
    'Na simulação, "→" mostra a tua marca com o mesmo nível relativo e a nova massa.';
}

/* Atalhos da simulação. */
function simPreset(kind) {
  const ctx = potentialCtx;
  if (!ctx || !ctx.ok) return;
  const real = composition(ctx.weight, ctx.fat, ctx.sex);
  if (kind === 'reset') {
    potentialSim = { weight: ctx.weight, fat: ctx.fat };
  } else if (kind === 'cut') {
    // Chegar ao peso objectivo só com perda de gordura (massa magra igual).
    DB.getSetting('goalWeight', null).then((g) => {
      const target = Number(g) || ctx.weight - 7;
      const fat = Math.max(4, (1 - real.lean / target) * 100);
      potentialSim = { weight: target, fat: fat };
      drawPotential();
    });
    return;
  } else if (kind === 'muscle') {
    // +3 kg de massa magra, gordura em kg igual.
    const lean = real.lean + 3;
    const weight = lean + real.fatKg;
    potentialSim = { weight: weight, fat: (1 - lean / weight) * 100 };
  }
  drawPotential();
}
