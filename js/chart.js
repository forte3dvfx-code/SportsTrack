/* chart.js — gráficos em SVG puro.
 * SVG em vez de canvas: escala sozinho, herda as cores do CSS e não
 * precisa de redesenho ao rodar o telemóvel. */

const CHART_W = 320;
const CHART_H = 150;
const PAD_L = 38;
const PAD_R = 8;
const PAD_T = 12;
const PAD_B = 24;

function svgEl(name, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, attrs[k]));
  return el;
}

/* Escala vertical com folga de 8% para os pontos não encostarem às bordas.
 * Se todos os valores forem iguais, abre um intervalo artificial. */
function yScale(values) {
  let min = Math.min.apply(null, values);
  let max = Math.max.apply(null, values);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.08;
  return { min: min - pad, max: max + pad };
}

/* points: [{ x: 'YYYY-MM-DD', y: number, color?: string }] ordenados por data.
 * opts:
 *   format    fn(y) -> string
 *   color     cor do traçado
 *   reference [{x, y}] linha de degraus por trás (ex.: recorde acumulado)
 *   caption   false para não escrever a legenda */
function renderLineChart(host, points, opts) {
  host.innerHTML = '';
  opts = opts || {};
  const fmt = opts.format || ((v) => String(Math.round(v)));
  const color = opts.color || 'var(--load)';
  const reference = opts.reference || null;

  if (!points.length) {
    host.innerHTML = '<p class="chart-empty">Sem dados suficientes.</p>';
    return;
  }

  const svg = svgEl('svg', {
    viewBox: '0 0 ' + CHART_W + ' ' + CHART_H,
    class: 'chart',
    preserveAspectRatio: 'none',
    role: 'img'
  });

  // A escala tem de acomodar também a linha de referência, senão sai fora.
  const ys = points.map((p) => p.y).concat(reference ? reference.map((r) => r.y) : []);
  const scale = yScale(ys);
  const plotW = CHART_W - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;

  const px = (i, n) => (n <= 1) ? PAD_L + plotW / 2 : PAD_L + (i / (n - 1)) * plotW;
  const py = (v) => PAD_T + plotH - ((v - scale.min) / (scale.max - scale.min)) * plotH;

  const dataYs = points.map((p) => p.y);
  [Math.min.apply(null, dataYs), Math.max.apply(null, dataYs)].forEach((v) => {
    svg.appendChild(svgEl('line', {
      x1: PAD_L, x2: CHART_W - PAD_R, y1: py(v), y2: py(v), class: 'chart-grid'
    }));
    const t = svgEl('text', { x: PAD_L - 6, y: py(v) + 3.5, class: 'chart-axis', 'text-anchor': 'end' });
    t.textContent = fmt(v);
    svg.appendChild(t);
  });

  // Linha de degraus: o recorde não desce, por isso desenha-se em patamares
  // e não interpolada, que daria a ideia falsa de subida gradual.
  if (reference && reference.length) {
    let d = '';
    reference.forEach((r, i) => {
      const x = px(i, reference.length);
      const y = py(r.y);
      if (!i) { d += 'M' + x.toFixed(1) + ' ' + y.toFixed(1); }
      else { d += ' L' + x.toFixed(1) + ' ' + py(reference[i - 1].y).toFixed(1) + ' L' + x.toFixed(1) + ' ' + y.toFixed(1); }
    });
    svg.appendChild(svgEl('path', {
      d: d, fill: 'none', stroke: 'var(--ink-faint)', 'stroke-width': 1.2,
      'stroke-dasharray': '3 3', opacity: '0.8'
    }));
  }

  const d = points.map((p, i) =>
    (i ? 'L' : 'M') + px(i, points.length).toFixed(1) + ' ' + py(p.y).toFixed(1)
  ).join(' ');

  // Área esbatida por baixo da linha: dá peso visual à série sem
  // competir com os pontos.
  if (points.length > 1) {
    const gid = gradientDef(svg, opts.pathColor || color);
    const base = PAD_T + plotH;
    svg.appendChild(svgEl('path', {
      d: d + ' L' + px(points.length - 1, points.length).toFixed(1) + ' ' + base +
         ' L' + px(0, points.length).toFixed(1) + ' ' + base + ' Z',
      fill: 'url(#' + gid + ')', stroke: 'none'
    }));
  }

  svg.appendChild(svgEl('path', {
    d: d, fill: 'none', stroke: opts.pathColor || color, 'stroke-width': 2,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: opts.pathColor ? '0.5' : '1'
  }));

  // Acima de 40 leituras os pontos deixam de se distinguir.
  if (points.length <= 40) {
    points.forEach((p, i) => {
      svg.appendChild(svgEl('circle', {
        cx: px(i, points.length), cy: py(p.y), r: 2.6, fill: p.color || color
      }));
    });
  }

  // O último valor em destaque, como uma etiqueta sobre o ponto.
  const lastP = points[points.length - 1];
  const lx = px(points.length - 1, points.length);
  const ly = py(lastP.y);
  svg.appendChild(svgEl('circle', { cx: lx, cy: ly, r: 6, fill: lastP.color || color, opacity: '0.25' }));
  svg.appendChild(svgEl('circle', { cx: lx, cy: ly, r: 3.4, fill: 'var(--ink)', stroke: lastP.color || color, 'stroke-width': 1.6 }));
  pill(svg, lx, ly - 11, fmt(lastP.y), CHART_W - PAD_R);

  const first = svgEl('text', { x: PAD_L, y: CHART_H - 7, class: 'chart-axis' });
  first.textContent = shortDate(points[0].x);
  svg.appendChild(first);

  if (points.length > 1) {
    const last = svgEl('text', { x: CHART_W - PAD_R, y: CHART_H - 7, class: 'chart-axis', 'text-anchor': 'end' });
    last.textContent = shortDate(points[points.length - 1].x);
    svg.appendChild(last);
  }

  host.appendChild(svg);

  if (opts.caption !== false) {
    const last = points[points.length - 1];
    const caption = document.createElement('p');
    caption.className = 'chart-caption';
    let text = 'Último: ' + fmt(last.y);
    if (points.length > 1) {
      const delta = last.y - points[0].y;
      const shown = fmt(Math.abs(delta));
      const isZero = !/[1-9]/.test(shown);
      const sign = isZero ? '±' : delta > 0 ? '+' : '−';
      text += '  ·  Desde o início: ' + sign + shown;
    }
    caption.textContent = text;
    host.appendChild(caption);
  }
}

/* bars: [{ label: string, value: number }] */
function renderBarChart(host, bars, opts) {
  host.innerHTML = '';
  opts = opts || {};
  const fmt = opts.format || ((v) => String(Math.round(v)));

  if (!bars.length) {
    host.innerHTML = '<p class="chart-empty">Sem dados suficientes.</p>';
    return;
  }

  const svg = svgEl('svg', {
    viewBox: '0 0 ' + CHART_W + ' ' + CHART_H,
    class: 'chart',
    preserveAspectRatio: 'none',
    role: 'img'
  });

  const max = Math.max.apply(null, bars.map((b) => b.value)) || 1;
  const plotW = CHART_W - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;
  const slot = plotW / bars.length;
  const barW = Math.max(2, slot * 0.62);

  const topLabel = svgEl('text', { x: PAD_L - 6, y: PAD_T + 4, class: 'chart-axis', 'text-anchor': 'end' });
  topLabel.textContent = fmt(max);
  svg.appendChild(topLabel);

  // Linha do alvo, quando existe (ex.: sessões por semana pretendidas)
  if (opts.target && opts.target <= max) {
    const ty = PAD_T + plotH - (opts.target / max) * plotH;
    svg.appendChild(svgEl('line', {
      x1: PAD_L, x2: CHART_W - PAD_R, y1: ty, y2: ty,
      stroke: 'var(--oxide)', 'stroke-width': 1, 'stroke-dasharray': '4 3', opacity: '0.9'
    }));
  }

  const gid = gradientDef(svg, 'var(--load)', 'var(--load-2)', true);
  bars.forEach((b, i) => {
    const h = (b.value / max) * plotH;
    svg.appendChild(svgEl('rect', {
      x: PAD_L + i * slot + (slot - barW) / 2,
      y: PAD_T + plotH - h,
      width: barW,
      height: Math.max(h, 1),
      fill: b.color || 'url(#' + gid + ')',
      rx: Math.min(4, barW / 2)
    }));
  });

  // Linha sobreposta (ex.: média móvel), alinhada ao centro de cada barra.
  if (opts.line && opts.line.length === bars.length) {
    const d = opts.line.map((v, i) =>
      (i ? 'L' : 'M') + (PAD_L + i * slot + slot / 2).toFixed(1) + ' ' +
      (PAD_T + plotH - (v / max) * plotH).toFixed(1)
    ).join(' ');
    svg.appendChild(svgEl('path', {
      d: d, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.6,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: '0.85'
    }));
  }

  if (opts.allLabels) {
    bars.forEach((b, i) => {
      const t = svgEl('text', {
        x: PAD_L + i * slot + slot / 2, y: CHART_H - 7,
        class: 'chart-axis', 'text-anchor': 'middle'
      });
      t.textContent = b.label;
      svg.appendChild(t);
    });
  } else {
    const firstLabel = svgEl('text', { x: PAD_L, y: CHART_H - 7, class: 'chart-axis' });
    firstLabel.textContent = bars[0].label;
    svg.appendChild(firstLabel);
    if (bars.length > 1) {
      const lastLabel = svgEl('text', { x: CHART_W - PAD_R, y: CHART_H - 7, class: 'chart-axis', 'text-anchor': 'end' });
      lastLabel.textContent = bars[bars.length - 1].label;
      svg.appendChild(lastLabel);
    }
  }

  host.appendChild(svg);

  if (opts.caption !== false) {
    const caption = document.createElement('p');
    caption.className = 'chart-caption';
    const total = bars.reduce((a, b) => a + b.value, 0);
    caption.textContent = opts.allLabels
      ? 'Total: ' + fmt(total)
      : 'Última: ' + fmt(bars[bars.length - 1].value);
    host.appendChild(caption);
  }
}

/* Mapa de calor anual: uma célula por dia, semanas em colunas.
 * counts: { 'YYYY-MM-DD': n } */
function renderHeatmap(host, counts, opts) {
  host.innerHTML = '';
  opts = opts || {};
  const weeks = opts.weeks || 53;

  const cell = 9;
  const gap = 2;
  const topPad = 14;
  const leftPad = 18;
  const width = leftPad + weeks * (cell + gap);
  const height = topPad + 7 * (cell + gap);

  const svg = svgEl('svg', {
    viewBox: '0 0 ' + width + ' ' + height,
    class: 'heatmap',
    role: 'img'
  });

  // Começa na segunda-feira da semana mais antiga a mostrar.
  const end = new Date();
  const start = new Date(end.valueOf());
  start.setDate(start.getDate() - (weeks * 7));
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));

  const max = Math.max(1, Math.max.apply(null, Object.keys(counts).map((k) => counts[k]).concat([1])));

  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

  let lastMonth = -1;
  const cursor = new Date(start.valueOf());

  for (let col = 0; col < weeks; col++) {
    for (let row = 0; row < 7; row++) {
      if (cursor > end) break;
      const key = iso(cursor);
      const n = counts[key] || 0;

      // Quatro degraus chegam: mais níveis não se distinguem a esta escala.
      let fill = 'var(--surface-2)';
      if (n > 0) {
        const ratio = n / max;
        fill = ratio > 0.66 ? 'var(--load)'
          : ratio > 0.33 ? 'rgba(92,168,255,0.7)'
          : 'rgba(92,168,255,0.4)';
      }

      const rect = svgEl('rect', {
        x: leftPad + col * (cell + gap),
        y: topPad + row * (cell + gap),
        width: cell, height: cell, rx: 2, fill: fill
      });
      const title = svgEl('title', {});
      title.textContent = key + ' · ' + n + (n === 1 ? ' treino' : ' treinos');
      rect.appendChild(title);
      svg.appendChild(rect);

      if (row === 0 && cursor.getMonth() !== lastMonth) {
        lastMonth = cursor.getMonth();
        const t = svgEl('text', {
          x: leftPad + col * (cell + gap), y: topPad - 4, class: 'chart-axis'
        });
        t.textContent = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][lastMonth];
        svg.appendChild(t);
      }

      cursor.setDate(cursor.getDate() + 1);
    }
  }

  ['S', 'Q', 'S'].forEach((label, i) => {
    const t = svgEl('text', {
      x: 0, y: topPad + (i * 2 + 1) * (cell + gap) + 7, class: 'chart-axis'
    });
    t.textContent = label;
    svg.appendChild(t);
  });

  host.appendChild(svg);
}

/* Tira de resultados: um quadrado por tentativa, da mais antiga para a mais
 * recente. Para respostas categóricas (dentro do tempo / cap) uma linha não
 * diz nada — o padrão vê-se melhor numa sequência de blocos. */
function renderStrip(host, items, opts) {
  host.innerHTML = '';
  opts = opts || {};

  if (!items.length) {
    host.innerHTML = '<p class="chart-empty">Sem tentativas.</p>';
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'strip';

  items.forEach((it) => {
    const cell = document.createElement('span');
    cell.className = 'strip-cell' + (it.hollow ? ' hollow' : '');
    cell.style.setProperty('--c', it.color);
    cell.title = it.title || '';
    cell.textContent = it.label || '';
    wrap.appendChild(cell);
  });

  host.appendChild(wrap);

  if (opts.caption) {
    const p = document.createElement('p');
    p.className = 'chart-caption';
    p.textContent = opts.caption;
    host.appendChild(p);
  }
}

function shortDate(iso) {
  const parts = String(iso).split('-');
  return parts.length === 3 ? parts[2] + '/' + parts[1] : iso;
}

/* ---------- Peças partilhadas ---------- */

let _gradSeq = 0;

/* Gradiente num <defs> do próprio SVG. As cores vão em style e não como
 * atributo, porque só assim aceitam var(--…). vertical=true é para barras
 * (cor plena de ponta a ponta); sem ele é a área esbatida de uma linha. */
function gradientDef(svg, colorA, colorB, vertical) {
  const id = 'g' + (++_gradSeq);
  let defs = svg.querySelector('defs');
  if (!defs) { defs = svgEl('defs', {}); svg.insertBefore(defs, svg.firstChild); }
  const g = svgEl('linearGradient', { id: id, x1: '0', y1: '0', x2: '0', y2: '1' });
  if (vertical) {
    g.appendChild(svgEl('stop', { offset: '0', style: 'stop-color:' + (colorB || colorA) }));
    g.appendChild(svgEl('stop', { offset: '1', style: 'stop-color:' + colorA }));
  } else {
    g.appendChild(svgEl('stop', { offset: '0', style: 'stop-color:' + colorA + ';stop-opacity:0.32' }));
    g.appendChild(svgEl('stop', { offset: '1', style: 'stop-color:' + colorA + ';stop-opacity:0' }));
  }
  defs.appendChild(g);
  return id;
}

/* Etiqueta arredondada com um valor, centrada em x e encostada à direita
 * quando não cabe. */
function pill(svg, x, y, text, maxX) {
  const w = Math.max(26, String(text).length * 5.6 + 12);
  let left = x - w / 2;
  if (maxX != null && left + w > maxX) left = maxX - w;
  if (left < PAD_L) left = PAD_L;
  const top = Math.max(0, y - 13);
  svg.appendChild(svgEl('rect', { x: left, y: top, width: w, height: 15, rx: 7.5, class: 'chart-pill' }));
  const t = svgEl('text', { x: left + w / 2, y: top + 10.5, 'text-anchor': 'middle', class: 'chart-pill-text' });
  t.textContent = text;
  svg.appendChild(t);
}

/* ---------- Anéis de progresso ----------
 * rings: [{ value: 0..1, color: 'var(--load)', color2?: 'var(--load-2)' }]
 * do exterior para o interior. O centro é HTML, sobreposto por CSS. */
function renderRings(host, rings, centerHtml) {
  host.innerHTML = '';
  const size = 160;
  // Com três anéis ficam mais finos, para o centro continuar a ter espaço.
  const stroke = rings.length > 2 ? 10 : 13;
  const gap = rings.length > 2 ? 4 : 5;
  const svg = svgEl('svg', { viewBox: '0 0 ' + size + ' ' + size, class: 'rings', role: 'img' });
  const c = size / 2;

  rings.forEach((ring, i) => {
    const r = c - stroke / 2 - i * (stroke + gap) - 2;
    const circ = 2 * Math.PI * r;
    svg.appendChild(svgEl('circle', {
      cx: c, cy: c, r: r, fill: 'none', stroke: 'var(--surface-3)', 'stroke-width': stroke
    }));
    const v = Math.max(0, Math.min(1, ring.value || 0));
    if (v > 0) {
      const id = 'r' + (++_gradSeq);
      let defs = svg.querySelector('defs');
      if (!defs) { defs = svgEl('defs', {}); svg.insertBefore(defs, svg.firstChild); }
      const g = svgEl('linearGradient', { id: id, x1: '0', y1: '0', x2: '1', y2: '1' });
      g.appendChild(svgEl('stop', { offset: '0', style: 'stop-color:' + ring.color }));
      g.appendChild(svgEl('stop', { offset: '1', style: 'stop-color:' + (ring.color2 || ring.color) }));
      defs.appendChild(g);
      svg.appendChild(svgEl('circle', {
        cx: c, cy: c, r: r, fill: 'none', stroke: 'url(#' + id + ')', 'stroke-width': stroke,
        'stroke-linecap': 'round',
        'stroke-dasharray': (circ * v).toFixed(1) + ' ' + circ.toFixed(1),
        transform: 'rotate(-90 ' + c + ' ' + c + ')',
        class: 'ring-arc'
      }));
    }
  });

  const wrap = document.createElement('div');
  wrap.className = 'rings-wrap';
  wrap.appendChild(svg);
  const center = document.createElement('div');
  center.className = 'rings-center';
  center.innerHTML = centerHtml || '';
  wrap.appendChild(center);
  host.appendChild(wrap);
}

/* ---------- Mini-linha (sparkline) ---------- */
function renderSpark(host, values, color) {
  host.innerHTML = '';
  if (values.length < 2) {
    host.innerHTML = '<span class="spark-empty">—</span>';
    return;
  }
  const W = 100, H = 30, P = 3;
  const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'spark', preserveAspectRatio: 'none' });
  let min = Math.min.apply(null, values);
  let max = Math.max.apply(null, values);
  if (min === max) { min -= 1; max += 1; }
  const x = (i) => P + (i / (values.length - 1)) * (W - 2 * P);
  const y = (v) => H - P - ((v - min) / (max - min)) * (H - 2 * P);
  const d = values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  const gid = gradientDef(svg, color || 'var(--load)');
  svg.appendChild(svgEl('path', { d: d + ' L' + x(values.length - 1) + ' ' + H + ' L' + x(0) + ' ' + H + ' Z', fill: 'url(#' + gid + ')' }));
  svg.appendChild(svgEl('path', {
    d: d, fill: 'none', stroke: color || 'var(--load)', 'stroke-width': 1.8,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke'
  }));
  host.appendChild(svg);
}

/* ---------- Previsão: histórico + projecções numa escala de tempo real ----------
 * history: [{x:'YYYY-MM-DD', y}]
 * series:  [{ points:[{x,y}], color, label }]   (desenhadas a tracejado)
 * band:    { lo:[{x,y}], hi:[{x,y}] }          (intervalo de incerteza)
 * opts:    { format, goal, height } */
function renderForecast(host, history, series, band, opts) {
  host.innerHTML = '';
  opts = opts || {};
  const fmt = opts.format || ((v) => v.toFixed(1));
  const H = opts.height || 170;

  const all = history.concat.apply(history.slice(), series.map((s) => s.points));
  if (!all.length) {
    host.innerHTML = '<p class="chart-empty">Sem dados suficientes.</p>';
    return;
  }

  const svg = svgEl('svg', {
    viewBox: '0 0 ' + CHART_W + ' ' + H, class: 'chart', preserveAspectRatio: 'none', role: 'img'
  });
  svg.style.height = H + 'px';

  const t = (iso) => new Date(iso + 'T00:00:00').getTime();
  const ts = all.map((p) => t(p.x));
  const tMin = Math.min.apply(null, ts);
  const tMax = Math.max.apply(null, ts);
  const ys = all.map((p) => p.y)
    .concat(band ? band.lo.map((p) => p.y).concat(band.hi.map((p) => p.y)) : [])
    .concat(opts.goal != null ? [opts.goal] : []);
  const scale = yScale(ys);
  const plotW = CHART_W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const px = (iso) => tMax === tMin ? PAD_L + plotW / 2 : PAD_L + ((t(iso) - tMin) / (tMax - tMin)) * plotW;
  const py = (v) => PAD_T + plotH - ((v - scale.min) / (scale.max - scale.min)) * plotH;
  const path = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + px(p.x).toFixed(1) + ' ' + py(p.y).toFixed(1)).join(' ');

  [scale.min + (scale.max - scale.min) * 0.1, scale.max - (scale.max - scale.min) * 0.1].forEach((v) => {
    svg.appendChild(svgEl('line', { x1: PAD_L, x2: CHART_W - PAD_R, y1: py(v), y2: py(v), class: 'chart-grid' }));
    const lab = svgEl('text', { x: PAD_L - 6, y: py(v) + 3.5, class: 'chart-axis', 'text-anchor': 'end' });
    lab.textContent = fmt(v);
    svg.appendChild(lab);
  });

  if (opts.goal != null) {
    svg.appendChild(svgEl('line', {
      x1: PAD_L, x2: CHART_W - PAD_R, y1: py(opts.goal), y2: py(opts.goal),
      stroke: 'var(--ok)', 'stroke-width': 1, 'stroke-dasharray': '2 3', opacity: '0.9'
    }));
    const gl = svgEl('text', { x: PAD_L + 3, y: py(opts.goal) - 4, class: 'chart-axis', fill: 'var(--ok)' });
    gl.setAttribute('style', 'fill: var(--ok)');
    gl.textContent = 'objectivo ' + fmt(opts.goal);
    svg.appendChild(gl);
  }

  if (band && band.lo.length > 1) {
    const d = path(band.hi) + ' ' + band.lo.slice().reverse()
      .map((p) => 'L' + px(p.x).toFixed(1) + ' ' + py(p.y).toFixed(1)).join(' ') + ' Z';
    svg.appendChild(svgEl('path', { d: d, fill: 'var(--load)', opacity: '0.12', stroke: 'none' }));
  }

  // Linha vertical "hoje": separa o que foi medido do que é projectado.
  const todayX = opts.today || (history.length ? history[history.length - 1].x : null);
  if (todayX) {
    const hx = px(todayX);
    svg.appendChild(svgEl('line', {
      x1: hx, x2: hx, y1: PAD_T, y2: PAD_T + plotH,
      stroke: 'var(--ink-faint)', 'stroke-width': 1, 'stroke-dasharray': '1 3'
    }));
  }

  // Só a linha, sem área: com poucas pesagens juntas a área virava um bloco.
  if (history.length > 1) {
    svg.appendChild(svgEl('path', {
      d: path(history), fill: 'none', stroke: 'var(--ink)', 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    }));
  }
  history.forEach((p) => {
    svg.appendChild(svgEl('circle', { cx: px(p.x), cy: py(p.y), r: 2.6, fill: 'var(--ink)' }));
  });

  series.forEach((s) => {
    if (s.points.length < 2) return;
    svg.appendChild(svgEl('path', {
      d: path(s.points), fill: 'none', stroke: s.color, 'stroke-width': 2,
      'stroke-dasharray': '5 4', 'stroke-linecap': 'round'
    }));
    const end = s.points[s.points.length - 1];
    svg.appendChild(svgEl('circle', { cx: px(end.x), cy: py(end.y), r: 3.4, fill: s.color }));
  });

  // Etiqueta só na série principal, para não se atropelarem.
  if (series.length && series[0].points.length) {
    const end = series[0].points[series[0].points.length - 1];
    pill(svg, px(end.x), py(end.y) - 9, fmt(end.y), CHART_W - PAD_R);
  }

  const first = svgEl('text', { x: PAD_L, y: H - 7, class: 'chart-axis' });
  first.textContent = shortDate(all.reduce((a, p) => (p.x < a ? p.x : a), all[0].x));
  svg.appendChild(first);
  if (todayX) {
    const today = svgEl('text', { x: px(todayX), y: H - 7, class: 'chart-axis', 'text-anchor': 'middle' });
    today.textContent = 'hoje';
    svg.appendChild(today);
  }
  const last = svgEl('text', { x: CHART_W - PAD_R, y: H - 7, class: 'chart-axis', 'text-anchor': 'end' });
  last.textContent = shortDate(all.reduce((a, p) => (p.x > a ? p.x : a), all[0].x));
  svg.appendChild(last);

  host.appendChild(svg);
}

const Chart = {
  line: renderLineChart,
  bar: renderBarChart,
  heatmap: renderHeatmap,
  strip: renderStrip,
  rings: renderRings,
  spark: renderSpark,
  forecast: renderForecast
};
