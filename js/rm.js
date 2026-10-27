/* rm.js — tabela "Os meus RM" (lente Força).
 *
 * Um RM por movimento: o máximo de uma repetição que já fizeste. Pode ser
 * escrito à mão (sem data = "de sempre") ou entrar sozinho quando guardas um
 * single marcado RM acima do registado. Onde há RM:
 *   · é ele o 1RM usado em todas as tabelas (vence as estimativas);
 *   · cada série mostra a sua % do RM, e a intensidade (leve/moderado/pesado)
 *     sai dessa % em vez de do melhor estimado.
 * Ao lado de cada RM mostra-se o 1RM estimado dos treinos recentes, para se
 * ver se o RM está desactualizado (estimativa acima dele = hora de testar).
 *
 * Carregado antes do app.js; usa os globais dele só quando é chamado. */

let rmEditing = null;   // exerciseId em edição no formulário

function renderRmTable(allSets, dateBySession) {
  const host = $('#rm-list');
  const since = addDaysISO(todayISO(), -90);

  // Melhor 1RM estimado de cada movimento nos últimos 90 dias.
  const recent = {};
  allSets.forEach((s) => {
    const d = dateBySession[s.sessionId];
    if (!d || d < since || s.warmup || !(s.weightKg > 0) || !(s.reps > 0)) return;
    const v = setE1rm(s);
    if (!recent[s.exerciseId] || v > recent[s.exerciseId].v) recent[s.exerciseId] = { v: v, date: d };
  });

  const ids = Object.keys(prMap).sort((a, b) => exerciseName(a).localeCompare(exerciseName(b), 'en'));
  $('#rm-count').textContent = ids.length ? ids.length + (ids.length === 1 ? ' movimento' : ' movimentos') : '';

  if (!ids.length) {
    host.innerHTML = '<p class="chart-empty">Ainda não registaste RM. Acrescenta os teus máximos em baixo.</p>';
  } else {
    host.innerHTML = '';
    ids.forEach((id) => {
      const p = prMap[id];
      const r = recent[id];
      const pct = r ? (r.v / p.kg) * 100 : null;
      const above = r && r.v > p.kg;

      const row = document.createElement('div');
      row.className = 'rm-row' + (above ? ' is-above' : '');
      row.innerHTML =
        '<button type="button" class="rm-main">' +
          '<span class="rm-name">' + escapeHtml(exerciseName(id)) +
            '<small>' + (p.date ? prettyDate(p.date) : 'de sempre') + '</small></span>' +
          '<span class="rm-kg">' + dec(p.kg, p.kg % 1 ? 1 : 0) + '<small> kg</small></span>' +
          '<span class="rm-now">' + (r
            ? '≈' + Math.round(r.v) + ' kg<small>' + Math.round(pct) + '% do RM' +
              (above ? ' · testa!' : '') + '</small>'
            : '<small>sem treino recente</small>') + '</span>' +
        '</button>' +
        '<button type="button" class="set-remove" aria-label="Apagar RM de ' + escapeHtml(exerciseName(id)) + '">×</button>';
      row.querySelector('.rm-main').addEventListener('click', () => fillRmForm(id));
      row.querySelector('.set-remove').addEventListener('click', async () => {
        if (!confirm('Apagar o RM de ' + exerciseName(id) + '?')) return;
        await DB.deletePr(id);
        await loadPrs();
        renderEvolution();
        toast('RM apagado');
      });
      host.appendChild(row);
    });
  }

  fillRmSelect();
}

/* Seletor de movimentos: barras e halteres primeiro (onde há RM com sentido). */
function fillRmSelect() {
  const sel = $('#rm-ex');
  const keep = rmEditing || sel.value;
  sel.innerHTML = '';
  ['barbell', 'dumbbell', 'gymnastics', 'other'].forEach((cat) => {
    const inCat = exercises.filter((e) => e.category === cat);
    if (!inCat.length) return;
    const g = document.createElement('optgroup');
    g.label = cat;
    inCat.forEach((e) => {
      const o = document.createElement('option');
      o.value = e.id;
      o.textContent = e.name + (prMap[e.id] ? ' · RM ' + prMap[e.id].kg : '');
      g.appendChild(o);
    });
    sel.appendChild(g);
  });
  if (keep) sel.value = keep;
}

function fillRmForm(id) {
  rmEditing = id;
  const p = prMap[id];
  fillRmSelect();
  $('#rm-ex').value = id;
  $('#rm-kg').value = p ? p.kg : '';
  $('#rm-date').value = p && p.date ? p.date : '';
  $('#rm-save').textContent = p ? 'Actualizar' : 'Guardar';
  $('#rm-kg').focus();
}

async function saveRmForm() {
  const id = $('#rm-ex').value;
  const kg = numOrNull($('#rm-kg').value);
  if (!id) return toast('Escolhe o movimento.');
  if (!(kg > 0)) return toast('Indica a carga do RM.');
  const date = $('#rm-date').value || null;
  await DB.savePr({ exerciseId: id, kg: kg, date: date, updatedAt: new Date().toISOString() });
  await loadPrs();
  rmEditing = null;
  $('#rm-kg').value = '';
  $('#rm-date').value = '';
  $('#rm-save').textContent = 'Guardar';
  await renderEvolution();
  toast('RM de ' + exerciseName(id) + ': ' + kg + ' kg');
}

function bindRmEvents() {
  $('#rm-save').addEventListener('click', saveRmForm);
  $('#rm-ex').addEventListener('change', (ev) => {
    const p = prMap[ev.target.value];
    rmEditing = p ? ev.target.value : null;
    $('#rm-kg').value = p ? p.kg : '';
    $('#rm-date').value = p && p.date ? p.date : '';
    $('#rm-save').textContent = p ? 'Actualizar' : 'Guardar';
  });
}
