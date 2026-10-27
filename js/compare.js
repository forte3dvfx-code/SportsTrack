/* compare.js — formas de comparar treinos que não dependem do nome.
 *
 * Porquê: nos dados reais, "Conditioning Workout Definition" e "Hyrox" são
 * nomes genéricos usados para treinos diferentes. Comparar tempos por nome
 * mistura WODs que não têm nada a ver. E os movimentos misturam metros,
 * calorias e repetições, por isso não há uma soma única de "trabalho".
 *
 * O denominador comum que existe em quase todas as sessões é o coração:
 * duração × FC média. Daí sai a carga de treino (TRIMP de Banister), que
 * põe na mesma escala um WOD de 20 minutos, um Hyrox de 50 e um dia de força.
 *
 * Carregado antes do app.js; usa os globais dele só quando é chamado. */

/* ---------- Carga de treino (TRIMP) ---------- */

let compareSex = '';

/* TRIMP de Banister: minutos × fracção da reserva cardíaca × factor
 * exponencial que pesa mais o esforço alto. Sem FC de repouso usa 60 bpm. */
function sessionTrimp(s) {
  if (!s || !s.avgHr || !s.durationMin || !hrProfile.maxHr) return null;
  const rest = hrProfile.restHr || 60;
  const span = hrProfile.maxHr - rest;
  if (span <= 0) return null;
  const x = Math.max(0, Math.min(1, (s.avgHr - rest) / span));
  const k = compareSex === 'f' ? 0.86 * Math.exp(1.67 * x)
    : compareSex === 'm' ? 0.64 * Math.exp(1.92 * x)
    : 0.75 * Math.exp(1.8 * x);
  return s.durationMin * x * k;
}

async function loadCompareProfile() {
  await loadHrProfile();
  compareSex = await DB.getSetting('sex', '');
}

/* Carga por semana: TRIMP quando há FC, senão não conta (e diz-se quantas). */
function weeklyLoads(sessions, weeks) {
  const keys = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const k = weekKey(addDaysISO(todayISO(), -7 * i));
    if (keys.indexOf(k) < 0) keys.push(k);
  }
  const byWeek = {};
  sessions.forEach((s) => {
    const t = sessionTrimp(s);
    if (t == null) return;
    const k = weekKey(s.date);
    byWeek[k] = (byWeek[k] || 0) + t;
  });
  return keys.map((k) => ({ key: k, value: byWeek[k] || 0 }));
}

/* Rácio agudo:crónico — carga dos últimos 7 dias contra a média semanal
 * dos últimos 28. Entre 0,8 e 1,3 é a zona em que o corpo acompanha;
 * acima de 1,5 é um salto que costuma andar de mão dada com lesões. */
function acuteChronic(sessions) {
  const today = todayISO();
  let acute = 0, chronic = 0, counted = 0;
  sessions.forEach((s) => {
    const t = sessionTrimp(s);
    if (t == null) return;
    if (s.date > addDaysISO(today, -7)) acute += t;
    if (s.date > addDaysISO(today, -28)) { chronic += t; counted++; }
  });
  if (!counted || !chronic) return null;
  const ratio = acute / (chronic / 4);
  let label, tone;
  if (ratio < 0.8) { label = 'abaixo do habitual'; tone = 'neutral'; }
  else if (ratio <= 1.3) { label = 'zona segura'; tone = 'good'; }
  else if (ratio <= 1.5) { label = 'a subir depressa'; tone = 'warn'; }
  else { label = 'pico de carga'; tone = 'warn'; }
  return { ratio: ratio, acute: acute, chronicWeek: chronic / 4, label: label, tone: tone };
}

function renderLoadSection(sessions) {
  const host = $('#chart-trimp');
  const tiles = $('#trimp-tiles');
  if (!hrProfile.maxHr) {
    host.innerHTML = '<p class="chart-empty">Preenche o ano de nascimento ou a FC máxima em Definições → Perfil para calcular a carga.</p>';
    tiles.innerHTML = '';
    $('#trimp-hint').textContent = '';
    return;
  }
  const weeks = weeklyLoads(sessions, 12);
  const avg = weeks.map((_, i) => {
    const w = weeks.slice(Math.max(0, i - 3), i + 1);
    return w.reduce((a, x) => a + x.value, 0) / w.length;
  });
  Chart.bar(host, weeks.map((w) => ({ label: w.key.slice(5), value: w.value })), {
    format: (v) => Math.round(v) + ' pts', line: avg, caption: false
  });

  const ac = acuteChronic(sessions);
  const noHr = sessions.filter((s) => !s.avgHr).length;
  const rows = [
    ['Últimos 7 dias', ac ? String(Math.round(ac.acute)) : '—', 'pontos de carga'],
    ['Semana típica', ac ? String(Math.round(ac.chronicWeek)) : '—', 'média de 4 semanas'],
    ['Rácio', ac ? dec(ac.ratio, 2) : '—', ac ? ac.label : 'sem dados recentes']
  ];
  tiles.innerHTML = rows.map(([l, v, u], i) =>
    '<div class="tile' + (i === 2 && ac ? ' tone-' + ac.tone : '') + '"><span class="tile-label">' + escapeHtml(l) + '</span>' +
    '<span class="tile-value">' + escapeHtml(v) + '</span>' +
    '<span class="tile-unit">' + escapeHtml(u) + '</span></div>'
  ).join('');

  $('#trimp-hint').textContent =
    'Carga = minutos × esforço cardíaco (TRIMP de Banister): 30 min a FC alta valem mais do que ' +
    '60 min a passear. É a única medida que compara um WOD, um Hyrox e um dia de força na mesma escala. ' +
    'Rácio entre 0,8 e 1,3 é a zona segura; acima de 1,5 é um salto brusco.' +
    (hrProfile.restHr ? '' : ' Sem FC de repouso em Definições, usa 60 bpm.') +
    (noHr ? ' ' + noHr + (noHr === 1 ? ' sessão sem FC não conta.' : ' sessões sem FC não contam.') : '');
}

/* ---------- WODs: agrupar por movimentos em vez de por nome ---------- */

let wodGroupMode = 'moves';   // 'moves' | 'name'

function wodSignature(w) {
  return Array.from(new Set((w.movements || []).map((m) => m.exerciseId).filter(Boolean)));
}

function jaccard(a, b) {
  if (!a.length && !b.length) return 0;
  const sb = new Set(b);
  const inter = a.filter((x) => sb.has(x)).length;
  return inter / (a.length + b.length - inter);
}

const FORMAT_LABELS = { forTime: 'For time', amrap: 'AMRAP', emom: 'EMOM', other: 'Outro' };

/* Agrupamento guloso: cada WOD junta-se ao primeiro grupo do mesmo formato
 * com quem partilha pelo menos 60% dos movimentos; senão abre um grupo novo.
 * WODs sem movimentos ficam agrupados pelo nome, como antes. */
function groupWods(wods) {
  const groups = [];
  wods.forEach((w) => {
    const sig = wodSignature(w);
    let g = null;
    if (sig.length) {
      g = groups.find((x) => x.sig.length && x.format === w.format && jaccard(sig, x.sig) >= 0.6);
    } else {
      g = groups.find((x) => !x.sig.length && x.name === (w.name || 'WOD'));
    }
    if (!g) {
      g = { sig: sig, format: w.format, name: w.name || 'WOD', wods: [] };
      groups.push(g);
    }
    g.wods.push(w);
  });

  groups.forEach((g, i) => {
    g.key = 'g' + i;
    if (g.sig.length) {
      // Os três movimentos mais comuns no grupo dão-lhe o nome.
      const count = {};
      g.wods.forEach((w) => wodSignature(w).forEach((id) => { count[id] = (count[id] || 0) + 1; }));
      const top = Object.keys(count).sort((a, b) => count[b] - count[a]).slice(0, 3).map(exerciseName);
      g.label = (FORMAT_LABELS[g.format] || 'WOD') + ' · ' + top.join(' + ');
    } else {
      g.label = g.name;
    }
    g.label += '  (' + g.wods.length + ')';
  });

  return groups.sort((a, b) => b.wods.length - a.wods.length || a.label.localeCompare(b.label));
}

/* Lista de grupos para o seletor da lente WOD, conforme o modo escolhido.
 * Devolve [{ key, label, wods }]. */
function wodChoices(allWods) {
  const usable = allWods.filter((w) => w.name || (w.movements && w.movements.length));
  if (wodGroupMode === 'name') {
    const names = Array.from(new Set(usable.map((w) => w.name || 'WOD'))).sort();
    return names.map((n) => {
      const wods = usable.filter((w) => (w.name || 'WOD') === n);
      return { key: 'n:' + n, label: n + '  (' + wods.length + ')', wods: wods };
    });
  }
  return groupWods(usable);
}

/* Para o WOD escolhido: outros WODs parecidos (≥ 40% dos movimentos),
 * com a percentagem de semelhança, para comparar também os "primos". */
function similarWods(group, allWods, dateBySession) {
  const ids = new Set(group.wods.map((w) => w.id));
  const ref = Array.from(new Set(group.wods.flatMap(wodSignature)));
  if (!ref.length) return [];
  return allWods
    .filter((w) => !ids.has(w.id) && dateBySession[w.sessionId])
    .map((w) => ({ w: w, sim: jaccard(ref, wodSignature(w)) }))
    .filter((x) => x.sim >= 0.4)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 5);
}

function renderSimilar(group, allWods, dateBySession) {
  const host = $('#wod-similar');
  const list = similarWods(group, allWods, dateBySession);
  if (!list.length) { host.innerHTML = ''; return; }
  host.innerHTML = '<p class="sub-title">Parecidos noutros grupos</p>' + list.map((x) =>
    '<div class="sim-row"><span class="sim-pct">' + Math.round(x.sim * 100) + '%</span>' +
    '<span class="sim-txt"><b>' + escapeHtml(x.w.name || 'WOD') + '</b>' +
    '<small>' + prettyDate(dateBySession[x.w.sessionId]) + ' · ' + escapeHtml(FORMAT_LABELS[x.w.format] || '') +
    (wodResult(x.w) ? ' · ' + escapeHtml(wodResult(x.w)) : '') + '</small></span></div>'
  ).join('');
}

/* ---------- Intensidade de cada WOD ---------- */

let wodIntSort = 'recent';   // 'recent' | 'hard'

function wodDurationMin(w, s) {
  if (w.timeSec) return w.timeSec / 60;
  if (w.capMin) return w.capMin;
  return s && s.durationMin ? s.durationMin : null;
}

function renderWodIntensity(allWods, sessionById) {
  const host = $('#wod-intensity-list');
  const rows = allWods.map((w) => {
    const s = sessionById[w.sessionId];
    if (!s) return null;
    const trimp = sessionTrimp(s);
    return {
      w: w, s: s,
      trimp: trimp,
      density: trimp != null ? trimp / s.durationMin : null,
      kcalMin: s.calories && s.durationMin ? s.calories / s.durationMin : null,
      pct: pctMaxHr(s.avgHr),
      dur: wodDurationMin(w, s)
    };
  }).filter(Boolean);

  if (!rows.length) {
    host.innerHTML = '<p class="chart-empty">Sem WODs registados.</p>';
    $('#wod-domain-tiles').innerHTML = '';
    return;
  }

  // Pontuação de intensidade: carga por minuto; sem FC, kcal por minuto.
  const score = (r) => r.density != null ? r.density : r.kcalMin;
  const max = Math.max.apply(null, rows.map((r) => score(r) || 0)) || 1;

  rows.sort(wodIntSort === 'hard'
    ? (a, b) => (score(b) || 0) - (score(a) || 0)
    : (a, b) => b.s.date.localeCompare(a.s.date));

  host.innerHTML = rows.slice(0, 15).map((r) => {
    const sc = score(r);
    return '<div class="int-row">' +
      '<div class="int-top"><b>' + escapeHtml(r.w.name || 'WOD') + '</b>' +
      '<span>' + (r.density != null ? dec(r.density, 2) + ' <small>pts/min</small>' : '—') + '</span></div>' +
      '<div class="int-bar"><i style="width:' + Math.round((sc || 0) / max * 100) + '%"></i></div>' +
      '<div class="int-meta">' + prettyDate(r.s.date) + ' · ' + escapeHtml(FORMAT_LABELS[r.w.format] || '') +
        (r.dur ? ' · ' + Math.round(r.dur) + ' min' : '') +
        (r.kcalMin ? ' · ' + dec(r.kcalMin) + ' kcal/min' : '') +
        (r.pct ? ' · ' + Math.round(r.pct) + '% FCmáx' : '') + '</div>' +
    '</div>';
  }).join('');

  // Domínios de tempo: curtos, médios e longos esforçam-se de maneira
  // diferente, por isso a intensidade só se compara dentro de cada um.
  const domains = [
    ['Curtos', '< 12 min', (d) => d < 12],
    ['Médios', '12–25 min', (d) => d >= 12 && d <= 25],
    ['Longos', '> 25 min', (d) => d > 25]
  ];
  $('#wod-domain-tiles').innerHTML = domains.map(([label, range, test]) => {
    const inD = rows.filter((r) => r.dur != null && test(r.dur));
    const pcts = inD.map((r) => r.pct).filter((v) => v != null);
    const avgPct = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
    return '<div class="tile"><span class="tile-label">' + label + ' <em>' + range + '</em></span>' +
      '<span class="tile-value">' + inD.length + '</span>' +
      '<span class="tile-unit">' + (avgPct ? Math.round(avgPct) + '% FCmáx média' : 'WODs') + '</span></div>';
  }).join('');
}

/* ---------- Força por padrão de movimento ---------- */

const PATTERNS = [
  ['Olímpicos', /clean|snatch|jerk/i],
  ['Peso morto', /deadlift|swing|good morning|rdl/i],
  ['Agachamento', /squat|lunge|thruster|step/i],
  ['Puxar', /pull|\brow\b|chin[- ]?up|muscle|rope/i],
  ['Empurrar', /press|bench|dip|push|handstand/i],
  ['Core', /plank|hollow|sit-up|pallof|toes|ghd|extension|l-sit/i]
];

function patternOf(name) {
  const p = PATTERNS.find(([, re]) => re.test(name));
  return p ? p[0] : 'Outros';
}

async function renderPatternSection(allSets, dateBySession) {
  const host = $('#pattern-rows');
  const body = await DB.getBodyMetrics();
  const bw = (body.find((b) => b.weightKg != null) || {}).weightKg || null;
  const today = todayISO();

  const byPattern = {};
  allSets.forEach((s) => {
    const date = dateBySession[s.sessionId];
    if (!date || s.warmup || !(s.reps > 0)) return;
    const name = exerciseName(s.exerciseId);
    const p = patternOf(name);
    const g = byPattern[p] || (byPattern[p] = { best: null, bestReps: null, tonnage28: 0, tonnagePrev: 0, sessions: new Set() });
    g.sessions.add(s.sessionId);
    if (!(s.weightKg > 0) && (!g.bestReps || s.reps > g.bestReps.v)) {
      g.bestReps = { v: s.reps, name: name, unit: UNITS[exerciseUnit(s.exerciseId)] || 'reps' };
    }
    if (s.weightKg > 0) {
      const v = setE1rm(s);
      // Movimentos com RM registado entram pelo RM, não pela estimativa.
      if (!rmFor(s.exerciseId) && (!g.best || v > g.best.v)) g.best = { v: v, name: name };
      const t = s.weightKg * s.reps;
      if (date > addDaysISO(today, -28)) g.tonnage28 += t;
      else if (date > addDaysISO(today, -56)) g.tonnagePrev += t;
    }
  });

  // RM registados entram como melhor medido do padrão.
  Object.keys(prMap).forEach((id) => {
    const name = exerciseName(id);
    const p = patternOf(name);
    const g = byPattern[p] || (byPattern[p] = { best: null, bestReps: null, tonnage28: 0, tonnagePrev: 0, sessions: new Set() });
    if (!g.best || prMap[id].kg >= g.best.v) g.best = { v: prMap[id].kg, name: name + ' (RM)' };
  });

  const order = PATTERNS.map((p) => p[0]).concat(['Outros']);
  const keys = order.filter((k) => byPattern[k]);
  if (!keys.length) {
    host.innerHTML = '<p class="chart-empty">Sem séries de força.</p>';
    return;
  }

  host.innerHTML = keys.map((k) => {
    const g = byPattern[k];
    const rel = g.best && bw ? dec(g.best.v / bw, 2) + '× peso' : '';
    const delta = g.tonnagePrev ? (g.tonnage28 - g.tonnagePrev) / g.tonnagePrev * 100 : null;
    return '<div class="pat-row">' +
      '<div class="pat-head"><b>' + k + '</b><small>' + g.sessions.size + (g.sessions.size === 1 ? ' sessão' : ' sessões') + '</small></div>' +
      '<div class="pat-cells">' +
        '<span><small>Melhor</small>' + (g.best ? Math.round(g.best.v) + ' kg' : g.bestReps ? g.bestReps.v + ' ' + g.bestReps.unit : '—') +
          (g.best || g.bestReps ? '<em>' + escapeHtml((g.best || g.bestReps).name) + '</em>' : '') + '</span>' +
        '<span><small>Relativa</small>' + (rel || '—') + '</span>' +
        '<span><small>Volume 4 sem.</small>' + (g.tonnage28 ? Math.round(g.tonnage28).toLocaleString('pt-PT') + ' kg' : '—') +
          (delta != null ? '<em class="' + (delta >= 0 ? 'trend-up' : 'trend-down') + '">' + signed(delta, 0) + '%</em>' : '') + '</span>' +
      '</div></div>';
  }).join('');
}
