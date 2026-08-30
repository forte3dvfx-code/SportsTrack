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
  svg.appendChild(svgEl('path', {
    d: d, fill: 'none', stroke: opts.pathColor || color, 'stroke-width': 1.6,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: opts.pathColor ? '0.5' : '1'
  }));

  // Acima de 40 leituras os pontos deixam de se distinguir.
  if (points.length <= 40) {
    points.forEach((p, i) => {
      svg.appendChild(svgEl('circle', {
        cx: px(i, points.length), cy: py(p.y), r: 3, fill: p.color || color
      }));
    });
  }

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
      const sign = delta > 0 ? '+' : '';
      text += '  ·  Desde o início: ' + sign + fmt(delta).replace(/^\+/, '');
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

  bars.forEach((b, i) => {
    const h = (b.value / max) * plotH;
    svg.appendChild(svgEl('rect', {
      x: PAD_L + i * slot + (slot - barW) / 2,
      y: PAD_T + plotH - h,
      width: barW,
      height: Math.max(h, 1),
      fill: b.color || 'var(--load)',
      rx: 1.5
    }));
  });

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
          : ratio > 0.33 ? 'rgba(74,144,217,0.7)'
          : 'rgba(74,144,217,0.4)';
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

function shortDate(iso) {
  const parts = String(iso).split('-');
  return parts.length === 3 ? parts[2] + '/' + parts[1] : iso;
}

const Chart = {
  line: renderLineChart,
  bar: renderBarChart,
  heatmap: renderHeatmap
};
