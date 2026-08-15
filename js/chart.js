/* chart.js — gráficos em SVG puro.
 * Escolhi SVG em vez de canvas porque escala sozinho em qualquer ecrã,
 * herda as cores do CSS e não precisa de redesenho ao rodar o telemóvel. */

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

/* Calcula a escala vertical com uma folga de 8% para os pontos não
 * encostarem às bordas. Se todos os valores forem iguais, abre um intervalo
 * artificial para a linha não ficar colada ao topo. */
function yScale(values) {
  let min = Math.min.apply(null, values);
  let max = Math.max.apply(null, values);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.08;
  return { min: min - pad, max: max + pad };
}

/* points: [{ x: 'YYYY-MM-DD', y: number, label: string }] ordenados por data.
 * opts: { format: fn(y)->string, color: string } */
function renderLineChart(host, points, opts) {
  host.innerHTML = '';
  opts = opts || {};
  const fmt = opts.format || ((v) => String(Math.round(v)));
  const color = opts.color || 'var(--load)';

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

  const ys = points.map((p) => p.y);
  const scale = yScale(ys);
  const plotW = CHART_W - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;

  const px = (i) => points.length === 1
    ? PAD_L + plotW / 2
    : PAD_L + (i / (points.length - 1)) * plotW;
  const py = (v) => PAD_T + plotH - ((v - scale.min) / (scale.max - scale.min)) * plotH;

  // Linhas de referência no mínimo e no máximo reais
  [Math.min.apply(null, ys), Math.max.apply(null, ys)].forEach((v) => {
    svg.appendChild(svgEl('line', {
      x1: PAD_L, x2: CHART_W - PAD_R, y1: py(v), y2: py(v), class: 'chart-grid'
    }));
    const t = svgEl('text', { x: PAD_L - 6, y: py(v) + 3.5, class: 'chart-axis', 'text-anchor': 'end' });
    t.textContent = fmt(v);
    svg.appendChild(t);
  });

  // Traçado
  const d = points.map((p, i) => (i ? 'L' : 'M') + px(i).toFixed(1) + ' ' + py(p.y).toFixed(1)).join(' ');
  svg.appendChild(svgEl('path', { d: d, fill: 'none', stroke: color, 'stroke-width': 2,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  // Pontos. Acima de 40 leituras deixam de se distinguir, por isso desaparecem.
  if (points.length <= 40) {
    points.forEach((p, i) => {
      svg.appendChild(svgEl('circle', { cx: px(i), cy: py(p.y), r: 2.6, fill: color }));
    });
  }

  // Só a primeira e a última data, para não empastelar o eixo
  const first = svgEl('text', { x: PAD_L, y: CHART_H - 7, class: 'chart-axis' });
  first.textContent = shortDate(points[0].x);
  svg.appendChild(first);

  if (points.length > 1) {
    const last = svgEl('text', { x: CHART_W - PAD_R, y: CHART_H - 7, class: 'chart-axis', 'text-anchor': 'end' });
    last.textContent = shortDate(points[points.length - 1].x);
    svg.appendChild(last);
  }

  host.appendChild(svg);

  // Último valor em destaque, que é o que se quer mesmo saber
  const last = points[points.length - 1];
  const first0 = points[0];
  const caption = document.createElement('p');
  caption.className = 'chart-caption';
  let text = 'Último: ' + fmt(last.y);
  if (points.length > 1) {
    const delta = last.y - first0.y;
    const sign = delta > 0 ? '+' : '';
    text += '  ·  Desde o início: ' + sign + fmt(delta).replace(/^\+/, '');
  }
  caption.textContent = text;
  host.appendChild(caption);
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

  bars.forEach((b, i) => {
    const h = (b.value / max) * plotH;
    svg.appendChild(svgEl('rect', {
      x: PAD_L + i * slot + (slot - barW) / 2,
      y: PAD_T + plotH - h,
      width: barW,
      height: Math.max(h, 1),
      fill: 'var(--load)',
      rx: 1.5
    }));
  });

  const firstLabel = svgEl('text', { x: PAD_L, y: CHART_H - 7, class: 'chart-axis' });
  firstLabel.textContent = bars[0].label;
  svg.appendChild(firstLabel);

  if (bars.length > 1) {
    const lastLabel = svgEl('text', { x: CHART_W - PAD_R, y: CHART_H - 7, class: 'chart-axis', 'text-anchor': 'end' });
    lastLabel.textContent = bars[bars.length - 1].label;
    svg.appendChild(lastLabel);
  }

  host.appendChild(svg);

  const caption = document.createElement('p');
  caption.className = 'chart-caption';
  caption.textContent = 'Última: ' + fmt(bars[bars.length - 1].value);
  host.appendChild(caption);
}

function shortDate(iso) {
  const parts = String(iso).split('-');
  return parts.length === 3 ? parts[2] + '/' + parts[1] : iso;
}

const Chart = {
  line: renderLineChart,
  bar: renderBarChart
};
