/* overview.js — lente "Resumo" e previsão de peso.
 *
 * Carregado antes do app.js: só define funções. Usa os globais do app.js
 * (dietMap, weeklyTarget, exerciseName, weekKey, isoOf, todayISO, epley,
 * mifflinStJeor, escapeHtml, $) apenas quando é chamado, já com tudo pronto. */

/* ---------- Utilitários de datas ---------- */

function addDaysISO(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoOf(d);
}

function daysBetween(aISO, bISO) {
  return Math.round((new Date(bISO + 'T00:00:00') - new Date(aISO + 'T00:00:00')) / 86400000);
}

/* Sinal explícito e vírgula decimal. Um valor que arredonda a zero leva ±,
 * para não aparecer "−0,0". */
function signed(v, digits) {
  const s = Math.abs(v).toFixed(digits == null ? 1 : digits);
  const zero = Number(s) === 0;
  return (zero ? '±' : v > 0 ? '+' : '−') + s.replace('.', ',');
}

function dec(v, digits) {
  return v.toFixed(digits == null ? 1 : digits).replace('.', ',');
}

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? 'Boa noite' : h < 13 ? 'Bom dia' : h < 20 ? 'Boa tarde' : 'Boa noite';
}

/* ---------- Ícones (SVG em linha, sem dependências) ---------- */

const ICONS = {
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.6 2.4-4.6.3 1.6 1.1 2.6 2.1 3.1C11 9 11 6 12 3z"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 2"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19l7-7"/>',
  heart: '<path d="M12 19s-7-4.4-7-9.5A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 7 2.5C19 14.6 12 19 12 19z"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  scale: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 10a3 3 0 0 1 6 0"/><path d="M12 10l1.5-1.5"/>',
  pause: '<circle cx="12" cy="12" r="8"/><path d="M10 9v6M14 9v6"/>',
  bolt: '<path d="M13 3L6 13h5l-1 8 7-10h-5l1-8z"/>'
};

function icon(name) {
  return '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
}

/* ---------- Separador Treino: faixa da semana e alvo ---------- */

/* Sessões da semana por slot: { 1: n, 2: n }. */
function weekSlotCounts(sessions, fromISO, toISO) {
  const c = { 1: 0, 2: 0 };
  sessions.forEach((s) => { if (s.date >= fromISO && s.date <= toISO) c[sessionSlot(s)]++; });
  return c;
}

/* Sete dias de segunda a domingo, cada um com dois pontos (Treino 1 e 2).
 * Um dia com algum treino fica destacado; tocar abre o treino mais recente
 * desse dia. */
function renderWeekStrip(sessions) {
  const today = todayISO();
  const monday = addDaysISO(today, -((new Date().getDay() + 6) % 7));
  const names = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const byDate = {};
  sessions.forEach((s) => { (byDate[s.date] = byDate[s.date] || []).push(s); });

  const host = $('#week-strip');
  host.innerHTML = '';
  names.forEach((name, i) => {
    const date = addDaysISO(monday, i);
    const day = byDate[date] || [];
    const has1 = day.some((s) => sessionSlot(s) === 1);
    const has2 = day.some((s) => sessionSlot(s) === 2);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'week-day' + (day.length ? ' has' : '') + (date === today ? ' today' : '') + (date > today ? ' future' : '');
    el.innerHTML = '<small>' + name + '</small><b>' + Number(date.slice(8)) + '</b>' +
      '<span class="wd-dots"><i class="' + (has1 ? 'on' : '') + '"></i><i class="' + (has2 ? 'on' : '') + '"></i></span>';
    el.setAttribute('aria-label', name + ' ' + prettyDate(date) +
      (has1 ? ', Treino 1' : '') + (has2 ? ', Treino 2' : '') + (day.length ? '' : ', sem treino'));
    if (day.length) el.addEventListener('click', () => openEditor(day[0].id));
    else el.disabled = true;
    host.appendChild(el);
  });

  const c = weekSlotCounts(sessions, monday, today);
  $('#wp-count').textContent = c[1] + ' / ' + weeklyTarget;
  $('#wp-bar').style.width = Math.min(100, (c[1] / weeklyTarget) * 100) + '%';
  $('#wp-count2').textContent = c[2] + ' / ' + weeklyTarget2;
  $('#wp-bar2').style.width = weeklyTarget2 ? Math.min(100, (c[2] / weeklyTarget2) * 100) + '%' : '0';
  $('#sessions-count').textContent = sessions.length ? sessions.length + ' no total' : '';
}

/* ---------- Lente Resumo ---------- */

async function renderOverview() {
  const [sessions, allSets, body] = await Promise.all([
    DB.getSessions(), getAnnotatedSets(), DB.getBodyMetrics()
  ]);

  $('#greet').textContent = greeting();
  $('#greet-date').textContent = prettyDate(todayISO());

  renderWeekHero(sessions);
  const ctx = await buildForecastContext(body, sessions);
  renderForecastMini(ctx);
  renderInsights(sessions, allSets, body);
  renderLiftSparks(allSets, sessions);
  renderLoadChart(sessions);
}

/* Anel exterior: sessões da semana contra o alvo.
 * Anel interior: dias cumpridos do plano alimentar, sobre os dias marcados. */
function renderWeekHero(sessions) {
  const thisWeek = weekKey(todayISO());
  const lastWeekKey = weekKey(addDaysISO(todayISO(), -7));
  const week = sessions.filter((s) => weekKey(s.date) === thisWeek);
  const prev = sessions.filter((s) => weekKey(s.date) === lastWeekKey);

  const monday = addDaysISO(todayISO(), -((new Date().getDay() + 6) % 7));
  let dietDone = 0, dietMarked = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDaysISO(monday, i);
    if (d > todayISO()) break;
    const st = dietStatus(d);
    if (st !== null) { dietMarked++; if (st) dietDone++; }
  }

  // Três anéis: Treino 1 (fora), Treino 2 (meio), plano alimentar (dentro).
  const c = weekSlotCounts(week, '0000-00-00', '9999-99-99');
  const target = weeklyTarget + weeklyTarget2;
  const n = c[1] + c[2];
  const left1 = Math.max(0, weeklyTarget - c[1]);
  const left2 = Math.max(0, weeklyTarget2 - c[2]);
  const status = (!left1 && !left2) ? 'No alvo ✓' : 'Faltam ' + (left1 + left2);

  Chart.rings($('#week-ring'), [
    { value: c[1] / weeklyTarget, color: 'var(--load)', color2: 'var(--load-2)' },
    { value: weeklyTarget2 ? c[2] / weeklyTarget2 : 0, color: '#3FE0F0', color2: '#5BE3A8' },
    { value: dietMarked ? dietDone / dietMarked : 0, color: '#A99BFF', color2: '#7B6CFF' }
  ],
    '<span class="rc-label">Esta semana</span>' +
    '<span class="rc-value">' + n + '<small>/' + target + '</small></span>' +
    '<span class="rc-unit">T1 ' + c[1] + '/' + weeklyTarget + ' · T2 ' + c[2] + '/' + weeklyTarget2 + '</span>' +
    '<span class="rc-badge">' + escapeHtml(status) + '</span>');

  const sum = (arr, f) => arr.reduce((a, s) => a + (s[f] || 0), 0);
  const kcal = sum(week, 'calories');
  const mins = sum(week, 'durationMin');
  const hrs = week.filter((s) => s.avgHr).map((s) => s.avgHr);
  const hr = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;

  const rows = [
    ['flame', 'Calorias', kcal ? kcal.toLocaleString('pt-PT') : '—', 'sem. passada ' + (sum(prev, 'calories') || 0).toLocaleString('pt-PT')],
    ['clock', 'Minutos', mins ? String(mins) : '—', 'sem. passada ' + (sum(prev, 'durationMin') || 0)],
    ['leaf', 'Plano alimentar', dietMarked ? dietDone + '/' + dietMarked : '—', dietMarked ? 'dias cumpridos' : 'nenhum dia marcado'],
    ['heart', 'FC média', hr ? hr + ' bpm' : '—', 'nas sessões da semana']
  ];

  const host = $('#week-stats');
  host.innerHTML = rows.map(([ic, label, value, sub]) =>
    '<div class="stat-row">' +
      '<span class="stat-ico">' + icon(ic) + '</span>' +
      '<span class="stat-txt"><span class="stat-label">' + label + '</span>' +
      '<span class="stat-value">' + escapeHtml(value) + '</span>' +
      '<span class="stat-sub">' + escapeHtml(sub) + '</span></span>' +
    '</div>'
  ).join('');
}

/* Melhor 1RM estimado por data, para um conjunto de séries com carga. */
function e1rmByDate(sets, dateBySession) {
  const byDate = {};
  sets.forEach((s) => {
    const date = dateBySession[s.sessionId];
    if (!date || !(s.weightKg > 0) || !(s.reps > 0) || s.warmup) return;
    const v = setE1rm(s);
    if (!byDate[date] || v > byDate[date]) byDate[date] = v;
  });
  return Object.keys(byDate).sort().map((d) => ({ date: d, v: byDate[d] }));
}

function liftSeries(allSets, sessions) {
  const dateBySession = {};
  sessions.forEach((s) => { dateBySession[s.id] = s.date; });
  const byEx = {};
  allSets.forEach((s) => { (byEx[s.exerciseId] = byEx[s.exerciseId] || []).push(s); });
  return Object.keys(byEx).map((id) => ({ id: id, entries: e1rmByDate(byEx[id], dateBySession) }))
    .filter((x) => x.entries.length);
}

/* Destaques: frases curtas calculadas, cada uma com o seu porquê.
 * Só aparece o que tem dados que o sustentem. */
function renderInsights(sessions, allSets, body) {
  const out = [];
  const today = todayISO();
  const d30 = addDaysISO(today, -30);
  const d14 = addDaysISO(today, -14);

  // Força: melhor dos últimos 30 dias contra o melhor de antes.
  const changes = [];
  liftSeries(allSets, sessions).forEach((ls) => {
    const recent = ls.entries.filter((e) => e.date >= d30);
    const before = ls.entries.filter((e) => e.date < d30);
    if (!recent.length || !before.length) return;
    const a = Math.max.apply(null, before.map((e) => e.v));
    const b = Math.max.apply(null, recent.map((e) => e.v));
    changes.push({ id: ls.id, a: a, b: b, pct: (b - a) / a * 100 });

    // Recorde recente: o melhor de sempre caiu nos últimos 14 dias.
    const best = ls.entries.reduce((m, e) => (e.v > m.v ? e : m), ls.entries[0]);
    if (best.date >= d14 && before.length) {
      out.push({ tone: 'good', ic: 'trophy', title: 'Recorde em ' + exerciseName(ls.id),
        text: '1RM estimado de ' + Math.round(best.v) + ' kg a ' + prettyDate(best.date) + '.' });
    }
  });
  changes.sort((x, y) => y.pct - x.pct);
  changes.filter((c) => c.pct >= 1).slice(0, 2).forEach((c) => {
    out.push({ tone: 'good', ic: 'up', title: exerciseName(c.id) + ' ' + signed(c.pct, 0) + '%',
      text: '1RM estimado ' + Math.round(c.a) + ' → ' + Math.round(c.b) + ' kg (últimos 30 dias contra antes).' });
  });
  const worst = changes[changes.length - 1];
  if (worst && worst.pct <= -5) {
    out.push({ tone: 'warn', ic: 'down', title: exerciseName(worst.id) + ' ' + signed(worst.pct, 0) + '%',
      text: 'Abaixo do teu melhor nos últimos 30 dias. Pode ser só um mês de cargas leves.' });
  }

  // Frequência das últimas 4 semanas.
  const last28 = sessions.filter((s) => s.date > addDaysISO(today, -28));
  if (sessions.length) {
    const pw1 = last28.filter((s) => sessionSlot(s) === 1).length / 4;
    const pw2 = last28.filter((s) => sessionSlot(s) === 2).length / 4;
    const ok = pw1 >= weeklyTarget && pw2 >= weeklyTarget2;
    out.push({ tone: ok ? 'good' : 'neutral', ic: 'calendar',
      title: dec(pw1 + pw2) + ' treinos por semana',
      text: 'Últimas 4 semanas: Treino 1 ' + dec(pw1) + ' (alvo ' + weeklyTarget + '), Treino 2 ' +
        dec(pw2) + ' (alvo ' + weeklyTarget2 + ').' });
  }

  // Descanso.
  if (sessions.length) {
    const since = daysBetween(sessions[0].date, today);
    if (since >= 4) {
      out.push({ tone: 'warn', ic: 'pause', title: since + ' dias sem treinar',
        text: 'Último treino a ' + prettyDate(sessions[0].date) + '.' });
    }
  }

  // Plano alimentar: últimas 2 semanas contra as 2 anteriores.
  const rate = (from, to) => {
    const c = dietCount(from, to);
    return c.counted ? { pct: c.done / c.counted * 100, marked: c.counted } : null;
  };
  const r1 = rate(d14, today);
  const r0 = rate(addDaysISO(today, -28), d14);
  if (r1) {
    const delta = r0 ? r1.pct - r0.pct : null;
    out.push({ tone: r1.pct >= 70 ? 'good' : r1.pct < 40 ? 'warn' : 'neutral', ic: 'leaf',
      title: 'Plano cumprido ' + Math.round(r1.pct) + '% dos dias',
      text: 'Últimos 14 dias (' + r1.marked + ' marcados)' +
        (delta != null ? ', ' + signed(delta, 0) + ' pontos face às 2 semanas anteriores.' : '.') });
  }

  // Peso desde a primeira pesagem.
  const weights = body.filter((b) => b.weightKg != null).sort((a, b) => a.date.localeCompare(b.date));
  if (weights.length >= 2) {
    const first = weights[0];
    const last = weights[weights.length - 1];
    const dv = last.weightKg - first.weightKg;
    out.push({ tone: 'neutral', ic: 'scale', title: signed(dv) + ' kg',
      text: 'De ' + dec(first.weightKg) + ' para ' + dec(last.weightKg) + ' kg desde ' + prettyDate(first.date) + '.' });
  }

  const host = $('#insights');
  if (!out.length) {
    host.innerHTML = '<p class="chart-empty">Regista mais treinos para veres destaques.</p>';
    return;
  }
  host.innerHTML = out.slice(0, 6).map((x) =>
    '<div class="insight tone-' + x.tone + '">' +
      '<span class="insight-ico">' + icon(x.ic) + '</span>' +
      '<span><b>' + escapeHtml(x.title) + '</b><span>' + escapeHtml(x.text) + '</span></span>' +
    '</div>'
  ).join('');
}

/* Os movimentos mais treinados, cada um com a sua mini-linha de 1RM estimado.
 * Tocar numa linha abre a lente Força já nesse movimento. */
function renderLiftSparks(allSets, sessions) {
  const host = $('#lift-sparks');
  host.innerHTML = '';
  const series = liftSeries(allSets, sessions)
    .filter((x) => x.entries.length >= 2)
    .sort((a, b) => b.entries.length - a.entries.length)
    .slice(0, 5);

  if (!series.length) {
    host.innerHTML = '<p class="chart-empty">Regista séries com carga para veres a evolução.</p>';
    return;
  }

  series.forEach((ls) => {
    const vals = ls.entries.map((e) => e.v);
    const n = vals.length;
    const half = Math.min(3, Math.floor(n / 2));
    const recent = Math.max.apply(null, vals.slice(n - half));
    const older = Math.max.apply(null, vals.slice(n - 2 * half, n - half));
    const pct = older ? (recent - older) / older * 100 : 0;
    const best = Math.max.apply(null, vals);

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'spark-row';
    row.innerHTML =
      '<span class="spark-name">' + escapeHtml(exerciseName(ls.id)) +
        '<small>' + n + ' sessões</small></span>' +
      '<span class="spark-host"></span>' +
      '<span class="spark-val">' + Math.round(best) + '<small> kg</small>' +
        '<em class="' + (pct > 0.5 ? 'trend-up' : pct < -0.5 ? 'trend-down' : 'trend-flat') + '">' +
        signed(pct, 0) + '%</em></span>';
    Chart.spark(row.querySelector('.spark-host'), vals,
      pct < -0.5 ? 'var(--oxide)' : 'var(--load)');
    row.addEventListener('click', () => {
      const sel = $('#ev-exercise');
      sel.innerHTML = '<option value="' + escapeHtml(ls.id) + '"></option>';
      sel.value = ls.id;
      currentLens = 'forca';
      renderEvolution();
      window.scrollTo(0, 0);
    });
    host.appendChild(row);
  });
}

/* Minutos de treino por semana (12 semanas) com média móvel de 4. */
function renderLoadChart(sessions) {
  const byWeek = {};
  sessions.forEach((s) => {
    const k = weekKey(s.date);
    byWeek[k] = (byWeek[k] || 0) + (s.durationMin || 0);
  });
  const keys = [];
  for (let i = 11; i >= 0; i--) {
    const k = weekKey(addDaysISO(todayISO(), -7 * i));
    if (keys.indexOf(k) < 0) keys.push(k);
  }
  const vals = keys.map((k) => byWeek[k] || 0);
  const avg = vals.map((_, i) => {
    const w = vals.slice(Math.max(0, i - 3), i + 1);
    return w.reduce((a, b) => a + b, 0) / w.length;
  });
  if (!vals.some((v) => v > 0)) {
    $('#chart-load').innerHTML = '<p class="chart-empty">Sem duração registada nas últimas 12 semanas.</p>';
    return;
  }
  Chart.bar($('#chart-load'), keys.map((k, i) => ({ label: k.slice(5), value: vals[i] })), {
    format: (v) => Math.round(v) + ' min',
    line: avg
  });
}

/* ============================================================
   Previsão de peso
   ============================================================

   Modelo de balanço energético, simulado dia a dia:
     gasto(dia)   = basal(peso) × 1,2  +  treinos/semana × kcal por treino ÷ 7
     ingestão     = calorias do plano, nos dias em que cumpres
                  = gasto + excedente, nos dias fora do plano
     peso(dia+1)  = peso(dia) + (ingestão − gasto) ÷ 7700
   O basal é recalculado com o peso de cada dia, por isso a perda abranda
   à medida que desces — como acontece na realidade.
   7700 kcal ≈ 1 kg de massa corporal é uma aproximação clássica. */

let forecastState = null;   // valores dos controlos "e se…"
let forecastCtx = null;     // dados de base, para redesenhar sem voltar à BD

async function buildForecastContext(body, sessions) {
  const [heightCm, birthYear, sex, legacyKcal, offPlan, goal,
    planTrain, planRest, maintTrain, maintRest, calibrate] = await Promise.all([
    DB.getSetting('heightCm', 0), DB.getSetting('birthYear', 0), DB.getSetting('sex', ''),
    DB.getSetting('dietKcal', null), DB.getSetting('offPlanKcal', 0), DB.getSetting('goalWeight', null),
    DB.getSetting('dietKcalTrain', null), DB.getSetting('dietKcalRest', null),
    DB.getSetting('maintKcalTrain', null), DB.getSetting('maintKcalRest', null),
    DB.getSetting('calibrateMaint', true)
  ]);
  // Calorias de dia de treino e de descanso de cada plano; sem valor
  // gravado, as de omissão (DIET_DEFAULTS em app.js).
  const lT = Number(planTrain) || DIET_DEFAULTS.dietKcalTrain;
  const lR = Number(planRest) || DIET_DEFAULTS.dietKcalRest;
  const mT = Number(maintTrain) || DIET_DEFAULTS.maintKcalTrain;
  const mR = Number(maintRest) || DIET_DEFAULTS.maintKcalRest;
  // O plano activo (perda ou manutenção) é o que se come nos dias cumpridos.
  const maintMode = dietPlan.mode === 'maint';
  const pT = maintMode ? mT : lT;
  const pR = maintMode ? mR : lR;

  const weights = body.filter((b) => b.weightKg != null)
    .map((b) => ({ x: b.date, y: b.weightKg }))
    .sort((a, b) => a.x.localeCompare(b.x));

  const today = todayISO();
  const missing = [];
  if (!Number(heightCm)) missing.push('altura');
  if (!Number(birthYear)) missing.push('ano de nascimento');
  if (!sex) missing.push('sexo');
  if (!weights.length) missing.push('uma pesagem');

  // Treino real e a sua intensidade.
  // 1. Calorias de cada sessão: as do relógio; sem elas, estimadas pela FC
  //    média e duração (Keytel et al., 2005).
  // 2. Calorias líquidas: o relógio conta o total gasto durante a sessão,
  //    incluindo o que o corpo gastaria de qualquer forma — esse pedaço já
  //    está no basal × 1,2, e somá-lo outra vez inflacionava o gasto.
  // 3. Ritmo recente: as últimas 4 semanas mandam, se tiverem pelo menos
  //    3 sessões medidas; senão, 90 dias. Assim, treinos mais intensos nas
  //    últimas semanas puxam a previsão logo.
  const recent28 = sessions.filter((s) => s.date > addDaysISO(today, -28));
  const w0 = weights.length ? weights[weights.length - 1].y : null;
  const age = new Date().getFullYear() - Number(birthYear);
  const bmrNow = (w0 && Number(heightCm) && sex) ? mifflinStJeor(w0, Number(heightCm), age, sex) : null;

  const measured = sessions.map((s) => {
    let gross = s.calories || null;
    let estimated = false;
    if (!gross && s.avgHr && s.durationMin && w0 && Number(birthYear) && sex) {
      gross = keytelKcalPerMin(s.avgHr, w0, age, sex) * s.durationMin;
      estimated = true;
    }
    if (!gross || !s.durationMin) return null;
    const restPart = bmrNow ? (bmrNow * 1.2 / 1440) * s.durationMin : 0;
    return { date: s.date, net: Math.max(0, gross - restPart), gross: gross,
      min: s.durationMin, hr: s.avgHr || null, estimated: estimated };
  }).filter(Boolean);

  const m28 = measured.filter((m) => m.date > addDaysISO(today, -28));
  const m90 = measured.filter((m) => m.date > addDaysISO(today, -90));
  const pool = m28.length >= 3 ? m28 : m90;
  const avgOf = (arr, f) => arr.length ? arr.reduce((a, x) => a + f(x), 0) / arr.length : null;
  const kcalPerSession = avgOf(pool, (m) => m.net);
  const kcalPerMinNow = avgOf(pool, (m) => m.gross / m.min);
  const withHr = pool.filter((m) => m.hr);
  const hrNow = avgOf(withHr, (m) => m.hr);

  // Mudança de intensidade: kcal/min das últimas 4 semanas contra as 8 anteriores.
  const older = measured.filter((m) => m.date <= addDaysISO(today, -28) && m.date > addDaysISO(today, -84));
  const kcalPerMinOld = avgOf(older, (m) => m.gross / m.min);
  const intensityChange = (kcalPerMinNow && kcalPerMinOld && m28.length >= 3)
    ? (kcalPerMinNow - kcalPerMinOld) / kcalPerMinOld * 100 : null;

  // Adesão real: dias cumpridos sobre dias marcados nas últimas 4 semanas;
  // com menos de 5 marcações usa o histórico todo.
  // Dias sem marca contam como falhados (desde o primeiro registo).
  const c28 = dietCount(addDaysISO(today, -28), today);
  const cAll = dietStart ? dietCount(addDaysISO(dietStart, -1), today) : { done: 0, counted: 0 };
  const base = c28.counted >= 5 ? c28 : cAll;
  const adherence = base.counted ? base.done / base.counted : null;

  // Tendência das pesagens (regressão linear), só com dados que a aguentem.
  let trendPerDay = null;
  const w56 = weights.filter((w) => w.x > addDaysISO(today, -56));
  if (w56.length >= 3 && daysBetween(w56[0].x, w56[w56.length - 1].x) >= 14) {
    const xs = w56.map((w) => daysBetween(w56[0].x, w.x));
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = w56.reduce((a, w) => a + w.y, 0) / w56.length;
    let num = 0, den = 0;
    xs.forEach((x, i) => { num += (x - mx) * (w56[i].y - my); den += (x - mx) * (x - mx); });
    trendPerDay = den ? num / den : null;
  }

  return {
    ok: !missing.length,
    missing: missing,
    weights: weights,
    w0: weights.length ? weights[weights.length - 1].y : null,
    heightCm: Number(heightCm),
    age: new Date().getFullYear() - Number(birthYear),
    sex: sex,
    planMode: maintMode ? 'maint' : 'loss',
    lossTrain: lT,
    lossRest: lR,
    planTrain: pT,
    planRest: pR,
    maintTrain: mT,
    maintRest: mR,
    calibrate: calibrate !== false,
    dietKcal: pT,   // mantém-se para as verificações "tem plano?"
    offPlan: Number(offPlan) || 0,
    goal: goal != null ? Number(goal) : null,
    spw: recent28.length / 4,   // sessões por semana, Treino 1 + Treino 2
    tdpw: new Set(recent28.map((s) => s.date)).size / 4,   // dias com treino por semana
    kcalPerSession: kcalPerSession,
    kcalPerMin: kcalPerMinNow,
    avgHr: hrNow,
    intensityChange: intensityChange,
    estimatedSessions: pool.filter((m) => m.estimated).length,
    adherence: adherence,
    trendPerDay: trendPerDay
  };
}

/* Keytel et al. (2005): gasto por minuto a partir da FC média, peso e idade.
 * Serve só de recurso para sessões sem calorias do relógio. */
function keytelKcalPerMin(hr, weightKg, age, sex) {
  const kj = sex === 'f'
    ? -20.4022 + 0.4472 * hr - 0.1263 * weightKg + 0.074 * age
    : -55.0969 + 0.6309 * hr + 0.1988 * weightKg + 0.2017 * age;
  return Math.max(0, kj / 4.184);
}

/* Devolve um ponto por semana, a começar hoje.
 * intensity multiplica as calorias de cada treino (0,8 = mais leve). */
function simulateWeight(ctx, p, spw, weeks, expMult, intensity) {
  const pts = [{ x: todayISO(), y: ctx.w0 }];
  let w = ctx.w0;
  const train = (spw * (ctx.kcalPerSession || 0) * (intensity || 1)) / 7;
  // Ingestão média nos dias do plano: mistura de dias de treino e de
  // descanso conforme os treinos por semana do cenário.
  // As calorias do plano dependem dos dias com treino, não do número de
  // sessões: dois treinos no mesmo dia continuam a ser um dia de treino.
  const intake = planAverage(ctx.planTrain, ctx.planRest, trainingDaysFor(ctx, spw));
  const calib = calibrationFactor(ctx);
  let deficitSum = 0;
  for (let day = 1; day <= weeks * 7; day++) {
    const spend = (mifflinStJeor(w, ctx.heightCm, ctx.age, ctx.sex) * 1.2 + train) * calib * (expMult || 1);
    const balance = p * (intake - spend) + (1 - p) * ctx.offPlan;
    deficitSum += balance;
    w += balance / 7700;
    if (day % 7 === 0) pts.push({ x: addDaysISO(todayISO(), day), y: w });
  }
  pts.avgBalance = deficitSum / (weeks * 7);
  return pts;
}

function planAverage(train, rest, spw) {
  if (train == null && rest == null) return null;
  const d = Math.max(0, Math.min(7, spw));
  return (d * (train || rest) + (7 - d) * (rest || train)) / 7;
}

/* Dias de treino por semana num cenário de spw sessões: mantém a proporção
 * real entre sessões e dias (ex.: 11 sessões em 6 dias), no máximo 7. */
function trainingDaysFor(ctx, spw) {
  if (!ctx.spw) return Math.min(7, spw);
  return Math.min(7, ctx.tdpw * spw / ctx.spw);
}

/* Gasto estimado pela fórmula, ao peso e frequência actuais. */
function modelSpend(ctx) {
  if (!ctx.ok) return null;
  return mifflinStJeor(ctx.w0, ctx.heightCm, ctx.age, ctx.sex) * 1.2 +
    (ctx.spw * (ctx.kcalPerSession || 0)) / 7;
}

/* Se há um plano de manutenção, ele diz quanto gastas de facto: o factor
 * acerta a fórmula a esse valor. Limitado a ±20% para um número mal
 * escrito não desfigurar a previsão. */
function calibrationFactor(ctx) {
  if (!ctx.calibrate || ctx.maintTrain == null) return 1;
  const model = modelSpend(ctx);
  if (!model) return 1;
  const maint = planAverage(ctx.maintTrain, ctx.maintRest, ctx.tdpw);
  return Math.max(0.8, Math.min(1.2, maint / model));
}

/* Resumo dos números do plano, mostrado em Definições → Perfil. */
async function renderDietCalcHint() {
  const host = $('#diet-calc-hint');
  if (!host) return;
  const [body, sessions] = await Promise.all([DB.getBodyMetrics(), DB.getSessions()]);
  const ctx = await buildForecastContext(body, sessions);
  if (!ctx.ok || ctx.planTrain == null) {
    host.textContent = 'Indica as calorias do plano para a previsão de peso.';
    return;
  }
  const spw = ctx.spw;
  const plan = planAverage(ctx.lossTrain, ctx.lossRest, ctx.tdpw);
  const model = modelSpend(ctx);
  const parts = ['Plano activo: ' + (ctx.planMode === 'maint' ? 'manutenção' : 'perda de peso') + '. Com ' + dec(spw) + ' treinos por semana em ' + dec(ctx.tdpw) + ' dias, o plano de perda dá em média ' +
    Math.round(plan) + ' kcal/dia.'];
  if (ctx.maintTrain != null) {
    const maint = planAverage(ctx.maintTrain, ctx.maintRest, ctx.tdpw);
    const diff = (maint - model) / model * 100;
    parts.push('A manutenção do plano (' + Math.round(maint) + ' kcal) e a estimativa da fórmula (' +
      Math.round(model) + ' kcal) diferem ' + signed(diff, 0) + '%' +
      (Math.abs(diff) <= 10 ? ' — batem certo.' : ' — vale a pena confirmar as quantidades.'));
    parts.push('Défice do plano de perda: cerca de ' + Math.round(maint - plan) + ' kcal/dia (≈' +
      dec((maint - plan) * 7 / 7700, 2) + ' kg por semana se cumprido todos os dias).');
  } else {
    parts.push('Gasto estimado pela fórmula: ' + Math.round(model) + ' kcal/dia.');
  }
  host.textContent = parts.join(' ');
}

/* Primeira semana em que a série atinge o objectivo (na direcção certa). */
function reachDate(points, w0, goal) {
  if (goal == null || w0 == null) return null;
  const down = goal < w0;
  for (let i = 1; i < points.length; i++) {
    if (down ? points[i].y <= goal : points[i].y >= goal) return points[i].x;
  }
  return null;
}

function forecastReady(ctx) {
  return ctx.ok && ctx.dietKcal && ctx.adherence != null;
}

function missingText(ctx) {
  const parts = [];
  if (ctx.missing.length) parts.push('preenche ' + ctx.missing.join(', ') + ' (Definições → Perfil e separador Corpo)');
  if (!ctx.dietKcal) parts.push('indica as calorias diárias do teu plano alimentar em Definições → Perfil');
  if (ctx.adherence == null) parts.push('marca alguns dias do plano alimentar no separador Corpo');
  return 'Para a previsão: ' + parts.join('; ') + '.';
}

/* Cartão compacto no Resumo: ritmo actual a 12 semanas. */
function renderForecastMini(ctx) {
  const host = $('#forecast-mini');
  if (!forecastReady(ctx)) {
    host.innerHTML = '<p class="chart-empty">' + escapeHtml(missingText(ctx)) + '</p>';
    return;
  }
  const weeks = 12;
  const now = simulateWeight(ctx, ctx.adherence, ctx.spw, weeks);
  const full = simulateWeight(ctx, 1, ctx.spw, weeks);
  const end = now[now.length - 1].y;
  const endFull = full[full.length - 1].y;

  host.innerHTML =
    '<div class="fx-head">' +
      '<div><span class="fx-big">' + dec(end) + '<small> kg</small></span>' +
      '<span class="fx-sub">daqui a 12 semanas, ao ritmo actual (' + signed(end - ctx.w0) + ' kg)</span></div>' +
      '<div class="fx-alt"><span>Plano a 100%</span><b>' + dec(endFull) + ' kg</b></div>' +
    '</div>' +
    '<div class="chart-host" id="chart-forecast-mini"></div>';

  Chart.forecast($('#chart-forecast-mini'), ctx.weights.slice(-8), [
    { points: now, color: 'var(--load)' },
    { points: full, color: 'var(--ok)' }
  ], null, { format: (v) => dec(v), goal: ctx.goal, today: todayISO(), height: 130 });
}

/* Painel completo na lente Corpo, com controlos "e se…". */
async function renderForecast(body, sessions) {
  forecastCtx = await buildForecastContext(body, sessions);
  const ctx = forecastCtx;

  if (!forecastState) {
    forecastState = {
      p: ctx.adherence != null ? Math.round(ctx.adherence * 20) * 5 : 80,
      spw: Math.round(ctx.spw * 2) / 2,
      weeks: 12,
      intensity: 1
    };
  }
  drawForecast();
}

function resetForecastState() {
  if (!forecastCtx) return;
  forecastState.p = forecastCtx.adherence != null ? Math.round(forecastCtx.adherence * 20) * 5 : 80;
  forecastState.spw = Math.round(forecastCtx.spw * 2) / 2;
  forecastState.intensity = 1;
  drawForecast();
}

function drawForecast() {
  const ctx = forecastCtx;
  const st = forecastState;
  if (!ctx) return;

  $('#fx-p').value = st.p;
  $('#fx-spw').value = st.spw;
  $('#fx-p-out').textContent = st.p + '% dos dias';
  $('#fx-spw-out').textContent = String(st.spw).replace('.', ',') + ' / semana';
  document.querySelectorAll('#fx-weeks .seg').forEach((b) => {
    b.classList.toggle('is-active', Number(b.dataset.weeks) === st.weeks);
  });
  document.querySelectorAll('#fx-int .seg').forEach((b) => {
    b.classList.toggle('is-active', Number(b.dataset.int) === st.intensity);
  });

  const ready = forecastReady(ctx);
  $('#forecast-controls').hidden = !ready;

  if (!ready) {
    $('#forecast-tiles').innerHTML = '';
    $('#forecast-legend').innerHTML = '';
    $('#chart-forecast').innerHTML = '<p class="chart-empty">' + escapeHtml(missingText(ctx)) + '</p>';
    $('#forecast-hint').textContent = '';
    return;
  }

  const weeks = st.weeks;
  const actual = simulateWeight(ctx, ctx.adherence, ctx.spw, weeks);
  const scen = simulateWeight(ctx, st.p / 100, st.spw, weeks, 1, st.intensity);
  const lo = simulateWeight(ctx, st.p / 100, st.spw, weeks, 1.1, st.intensity);
  const hi = simulateWeight(ctx, st.p / 100, st.spw, weeks, 0.9, st.intensity);

  const series = [{ points: scen, color: 'var(--load)', label: 'Cenário escolhido' }];
  const sameAsActual = Math.abs(st.p / 100 - ctx.adherence) < 0.03 && Math.abs(st.spw - ctx.spw) < 0.26 && st.intensity === 1;
  if (!sameAsActual) series.push({ points: actual, color: 'var(--ink-dim)', label: 'Ritmo actual' });

  let trend = null;
  if (ctx.trendPerDay != null) {
    trend = [{ x: todayISO(), y: ctx.w0 }, { x: addDaysISO(todayISO(), weeks * 7), y: ctx.w0 + ctx.trendPerDay * weeks * 7 }];
    series.push({ points: trend, color: 'var(--amber)', label: 'Tendência das pesagens' });
  }

  Chart.forecast($('#chart-forecast'), ctx.weights, series, { lo: lo, hi: hi },
    { format: (v) => dec(v), goal: ctx.goal, today: todayISO(), height: 190 });

  $('#forecast-legend').innerHTML = series.map((s) =>
    '<span class="legend-item"><i style="background:' + s.color + '"></i>' + escapeHtml(s.label) + '</span>'
  ).join('') + '<span class="legend-item"><i class="band-swatch"></i>Margem ±10%</span>';

  const end = scen[scen.length - 1].y;
  const perWeek = (end - ctx.w0) / weeks;
  const reach = reachDate(simulateWeight(ctx, st.p / 100, st.spw, 104, 1, st.intensity), ctx.w0, ctx.goal);

  const tiles = [
    ['Em ' + weeks + ' semanas', dec(end), 'kg (' + signed(end - ctx.w0) + ')'],
    ['Ritmo', signed(perWeek, 2), 'kg por semana'],
    ['Balanço médio', signed(Math.round(scen.avgBalance), 0), 'kcal por dia'],
    ['Objectivo', ctx.goal == null ? '—' : reach ? (reach.slice(0, 4) === todayISO().slice(0, 4)
        ? prettyDate(reach).replace(/ \d{4}$/, '')
        : prettyDate(reach).replace(/ (\d{2})(\d{2})$/, ' $2')) : 'não atinge',
      ctx.goal == null ? 'define em Definições' : dec(ctx.goal) + ' kg' + (reach ? '' : ' em 2 anos')]
  ];
  $('#forecast-tiles').innerHTML = tiles.map(([l, v, u]) =>
    '<div class="tile"><span class="tile-label">' + escapeHtml(l) + '</span>' +
    '<span class="tile-value">' + escapeHtml(v) + '</span>' +
    '<span class="tile-unit">' + escapeHtml(u) + '</span></div>'
  ).join('');

  const kps = ctx.kcalPerSession ? Math.round(ctx.kcalPerSession) : 0;
  const intTxt = ctx.kcalPerMin
    ? 'Intensidade recente: ' + dec(ctx.kcalPerMin) + ' kcal/min' +
      (ctx.avgHr ? ', FC média ' + Math.round(ctx.avgHr) + ' bpm' : '') +
      (ctx.intensityChange != null ? ' (' + signed(ctx.intensityChange, 0) + '% face às 8 semanas anteriores)' : '') +
      (ctx.estimatedSessions ? '; ' + ctx.estimatedSessions + ' sessões sem calorias estimadas pela FC' : '') + '. '
    : '';
  $('#forecast-hint').textContent =
    'Valores reais: cumpres o plano em ' + Math.round(ctx.adherence * 100) + '% dos dias marcados e fazes ' +
    dec(ctx.spw) + ' treinos por semana (Treino 1 + Treino 2) em ' + dec(ctx.tdpw) + ' dias, ≈' + kps +
    ' kcal líquidas cada: ≈' + Math.round(kps * ctx.spw).toLocaleString('pt-PT') +
    ' kcal por semana de gasto total em treino, já sem o que gastarias em repouso. ' +
    intTxt +
    'Gasto = basal × 1,2 + treino' +
    (calibrationFactor(ctx) !== 1 ? ', acertado ' + signed((calibrationFactor(ctx) - 1) * 100, 0) +
      '% pelo teu plano de manutenção' : '') +
    '; nos dias do plano comes ' + ctx.planTrain + ' kcal nos dias de treino e ' + ctx.planRest +
    ' nos outros (média ' + Math.round(planAverage(ctx.planTrain, ctx.planRest, trainingDaysFor(ctx, st.spw))) + ' com ' +
    dec(trainingDaysFor(ctx, st.spw)) + ' dias de treino por semana); nos dias fora do plano, ' +
    (ctx.offPlan ? '+' + ctx.offPlan + ' kcal acima' : 'o mesmo que gastas') + '. ' +
    'É uma estimativa: a água e o sal mexem o peso 1–2 kg de um dia para o outro, e as fórmulas ' +
    'erram cerca de 10% (a faixa sombreada). Não substitui um nutricionista.';
}
