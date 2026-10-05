/* db.js — camada de persistência (IndexedDB)
 * Todas as funções devolvem Promises. Sem dependências externas.
 *
 * VERSÃO 3: acrescenta a store 'diet' (marcação diária do plano alimentar).
 * VERSÃO 2: acrescentou a store 'settings'.
 * As migrações são aditivas — nada do que está gravado se perde. */

const DB_NAME = 'treino-db';
const DB_VERSION = 3;

let _db = null;

/* Gerador de ids. crypto.randomUUID só existe em contexto seguro (https/localhost),
 * por isso há um fallback para quando a app é aberta directamente do disco. */
function uid() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/* Catálogo inicial de movimentos. Nomes em inglês, como se usam no box. */
const SEED_EXERCISES = [
  // [nome, categoria, unidade]. A unidade é o que torna os movimentos
  // comparáveis entre WODs: 400 num Run são metros, 25 num Row Cals são
  // calorias, 10 num Wall Ball são repetições.
  ['Back Squat', 'barbell', 'reps'],
  ['Front Squat', 'barbell', 'reps'],
  ['Overhead Squat', 'barbell', 'reps'],
  ['Deadlift', 'barbell', 'reps'],
  ['Sumo Deadlift High Pull', 'barbell', 'reps'],
  ['Clean', 'barbell', 'reps'],
  ['Power Clean', 'barbell', 'reps'],
  ['Hang Power Clean', 'barbell', 'reps'],
  ['Clean and Jerk', 'barbell', 'reps'],
  ['Snatch', 'barbell', 'reps'],
  ['Power Snatch', 'barbell', 'reps'],
  ['Push Press', 'barbell', 'reps'],
  ['Push Jerk', 'barbell', 'reps'],
  ['Split Jerk', 'barbell', 'reps'],
  ['Strict Press', 'barbell', 'reps'],
  ['Bench Press', 'barbell', 'reps'],
  ['Thruster', 'barbell', 'reps'],
  ['Bent Over Row', 'barbell', 'reps'],
  ['Dumbbell Snatch', 'dumbbell', 'reps'],
  ['Dumbbell Thruster', 'dumbbell', 'reps'],
  ['Dumbbell Bench Press', 'dumbbell', 'reps'],
  ['Dumbbell Hang Clean and Jerk', 'dumbbell', 'reps'],
  ['Dumbbell Reverse Lunge', 'dumbbell', 'reps'],
  ['Devil Press', 'dumbbell', 'reps'],
  ['Kettlebell Swing', 'dumbbell', 'reps'],
  ['Goblet Squat', 'dumbbell', 'reps'],
  ['Farmers Carry', 'dumbbell', 'm'],
  ['Pull-up', 'gymnastics', 'reps'],
  ['Chest to Bar', 'gymnastics', 'reps'],
  ['Muscle-up', 'gymnastics', 'reps'],
  ['Bar Muscle-up', 'gymnastics', 'reps'],
  ['Ring Muscle-up', 'gymnastics', 'reps'],
  ['Toes to Bar', 'gymnastics', 'reps'],
  ['Handstand Push-up', 'gymnastics', 'reps'],
  ['Handstand Walk', 'gymnastics', 'm'],
  ['Ring Dip', 'gymnastics', 'reps'],
  ['Push-up', 'gymnastics', 'reps'],
  ['Hollow Rock', 'gymnastics', 'reps'],
  ['Chinese Plank', 'gymnastics', 's'],
  ['Box Jump', 'other', 'reps'],
  ['Box Jump Over', 'other', 'reps'],
  ['Wall Ball', 'other', 'reps'],
  ['Rope Climb', 'other', 'reps'],
  ['GHD Sit-up', 'other', 'reps'],
  ['Sit-up', 'other', 'reps'],
  ['Back Extension', 'other', 'reps'],
  ['Pallof Press', 'other', 'reps'],
  ['Burpee', 'other', 'reps'],
  ['Burpee Over Bar', 'other', 'reps'],
  ['Burpee to Plate', 'other', 'reps'],
  ['Burpee Over Dumbbell', 'other', 'reps'],
  ['Burpee Box Jump Over', 'other', 'reps'],
  ['Burpee Broad Jump', 'other', 'reps'],
  ['Walking Lunge', 'other', 'reps'],
  ['DoubleUnder', 'other', 'reps'],
  ['Slam Ball Clean', 'other', 'reps'],
  ['Slam Ball Over Shoulder', 'other', 'reps'],
  ['Slam Ball Carry', 'other', 'm'],
  ['Sled Push', 'other', 'm'],
  ['Sprint Uphill', 'other', 'reps'],
  ['Run', 'other', 'm'],
  ['Row Cals', 'other', 'cal'],
  ['Row Meters', 'other', 'm'],
  ['Ski Cals', 'other', 'cal'],
  ['Ski Meters', 'other', 'm'],
  ['Echo Bike Cals', 'other', 'cal'],
  ['Echo Bike Meters', 'other', 'm'],
  ['Erg Cals', 'other', 'cal']
];

/* Abre (e migra) a base de dados. Chamada uma única vez no arranque. */
function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;

      if (!db.objectStoreNames.contains('sessions')) {
        const s = db.createObjectStore('sessions', { keyPath: 'id' });
        s.createIndex('date', 'date');
        s.createIndex('externalId', 'externalId');
      }
      if (!db.objectStoreNames.contains('exercises')) {
        db.createObjectStore('exercises', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('sets')) {
        const s = db.createObjectStore('sets', { keyPath: 'id' });
        s.createIndex('sessionId', 'sessionId');
        s.createIndex('exerciseId', 'exerciseId');
      }
      if (!db.objectStoreNames.contains('wods')) {
        const s = db.createObjectStore('wods', { keyPath: 'id' });
        s.createIndex('sessionId', 'sessionId');
        s.createIndex('name', 'name');
      }
      if (!db.objectStoreNames.contains('bodyMetrics')) {
        // A data é a própria chave: uma medição por dia, sem duplicados possíveis.
        db.createObjectStore('bodyMetrics', { keyPath: 'date' });
      }
      // Novo na versão 2.
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      // Novo na versão 3. Data como chave: uma marcação por dia.
      if (!db.objectStoreNames.contains('diet')) {
        db.createObjectStore('diet', { keyPath: 'date' });
      }
    };

    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

/* Helper genérico: corre uma operação numa store e resolve quando a transacção fecha. */
function tx(storeNames, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    let out;
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
    out = fn(t);
  }));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAll(storeName) {
  return openDB().then((db) =>
    reqToPromise(db.transaction(storeName).objectStore(storeName).getAll())
  );
}

function getByIndex(storeName, indexName, value) {
  return openDB().then((db) =>
    reqToPromise(db.transaction(storeName).objectStore(storeName).index(indexName).getAll(value))
  );
}

/* ---------- Exercícios ---------- */

async function seedExercisesIfEmpty() {
  const existing = await getExercises();
  if (existing.length > 0) return existing;

  await tx('exercises', 'readwrite', (t) => {
    const store = t.objectStore('exercises');
    SEED_EXERCISES.forEach(([name, category, unit]) => {
      store.put({ id: uid(), name: name, category: category, unit: unit });
    });
  });
  return getExercises();
}

function getExercises() {
  return getAll('exercises').then((rows) =>
    rows.sort((a, b) => a.name.localeCompare(b.name, 'en'))
  );
}

async function addExercise(name, category, unit) {
  const record = {
    id: uid(),
    name: name.trim(),
    category: category || 'other',
    unit: unit || 'reps'
  };
  await tx('exercises', 'readwrite', (t) => t.objectStore('exercises').put(record));
  return record;
}

/* Só se permite apagar movimentos nunca usados — apagar um movimento com
 * séries gravadas deixaria histórico órfão sem nome. */
async function countSetsForExercise(exerciseId) {
  const rows = await getByIndex('sets', 'exerciseId', exerciseId);
  return rows.length;
}

function deleteExercise(id) {
  return tx('exercises', 'readwrite', (t) => t.objectStore('exercises').delete(id));
}

/* ---------- Sessões ---------- */

function getSessions() {
  return getAll('sessions').then((rows) =>
    rows.sort((a, b) => b.date.localeCompare(a.date))
  );
}

function getSession(id) {
  return openDB().then((db) =>
    reqToPromise(db.transaction('sessions').objectStore('sessions').get(id))
  );
}

function getSetsBySession(sessionId) {
  return getByIndex('sets', 'sessionId', sessionId)
    .then((rows) => rows.sort((a, b) => a.order - b.order));
}

function getWodsBySession(sessionId) {
  return getByIndex('wods', 'sessionId', sessionId);
}

function getAllSets() { return getAll('sets'); }
function getAllWods() { return getAll('wods'); }

/* Grava a sessão inteira: cabeçalho + séries + wod.
 * As séries e o wod anteriores são apagados e reescritos — é a forma mais
 * simples de manter tudo coerente numa app de um só utilizador. */
async function saveSession(session, sets, wods) {
  const oldSets = await getSetsBySession(session.id);
  const oldWods = await getWodsBySession(session.id);

  return tx(['sessions', 'sets', 'wods'], 'readwrite', (t) => {
    const sessionStore = t.objectStore('sessions');
    const setStore = t.objectStore('sets');
    const wodStore = t.objectStore('wods');

    oldSets.forEach((s) => setStore.delete(s.id));
    oldWods.forEach((w) => wodStore.delete(w.id));

    sessionStore.put(session);
    sets.forEach((s) => setStore.put(s));
    wods.forEach((w) => wodStore.put(w));
  });
}

async function deleteSession(id) {
  const oldSets = await getSetsBySession(id);
  const oldWods = await getWodsBySession(id);

  return tx(['sessions', 'sets', 'wods'], 'readwrite', (t) => {
    oldSets.forEach((s) => t.objectStore('sets').delete(s.id));
    oldWods.forEach((w) => t.objectStore('wods').delete(w.id));
    t.objectStore('sessions').delete(id);
  });
}

/* ---------- Medições corporais ---------- */

function getBodyMetrics() {
  return getAll('bodyMetrics').then((rows) =>
    rows.sort((a, b) => b.date.localeCompare(a.date))
  );
}

function getBodyMetric(date) {
  return openDB().then((db) =>
    reqToPromise(db.transaction('bodyMetrics').objectStore('bodyMetrics').get(date))
  );
}

function saveBodyMetric(record) {
  return tx('bodyMetrics', 'readwrite', (t) => t.objectStore('bodyMetrics').put(record));
}

function deleteBodyMetric(date) {
  return tx('bodyMetrics', 'readwrite', (t) => t.objectStore('bodyMetrics').delete(date));
}

/* ---------- Plano alimentar ---------- */

/* Ausência de registo não é o mesmo que "não cumpri": um dia por marcar
 * fica simplesmente fora das contas, em vez de contar como falha. */
function getDietDays() {
  return getAll('diet');
}

function setDietDay(date, ok) {
  return tx('diet', 'readwrite', (t) => t.objectStore('diet').put({ date: date, ok: !!ok }));
}

function deleteDietDay(date) {
  return tx('diet', 'readwrite', (t) => t.objectStore('diet').delete(date));
}

/* ---------- Definições ---------- */

async function getSetting(key, fallback) {
  const db = await openDB();
  const row = await reqToPromise(db.transaction('settings').objectStore('settings').get(key));
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  return tx('settings', 'readwrite', (t) => t.objectStore('settings').put({ key: key, value: value }));
}

/* ---------- Exportar / importar ---------- */

async function exportAll() {
  const [sessions, sets, wods, exercisesRows, bodyMetrics, diet] = await Promise.all([
    getAll('sessions'), getAll('sets'), getAll('wods'),
    getAll('exercises'), getAll('bodyMetrics'), getAll('diet')
  ]);
  return {
    app: 'treino',
    schema: 4,
    exportedAt: new Date().toISOString(),
    data: {
      sessions: sessions,
      sets: sets,
      wods: wods,
      exercises: exercisesRows,
      bodyMetrics: bodyMetrics,
      diet: diet
    }
  };
}

/* Importa fundindo com o que já existe, nunca apagando.
 * Os movimentos são reconciliados por nome: se "Back Squat" já existe com
 * outro id, as séries importadas são reapontadas para o id local em vez de
 * se criar um segundo "Back Squat" no catálogo. */
async function importAll(payload) {
  if (!payload || !payload.data) throw new Error('Ficheiro sem o campo "data".');
  const d = payload.data;
  const result = { sessions: 0, sets: 0, wods: 0, exercises: 0, bodyMetrics: 0, diet: 0 };

  const local = await getExercises();
  const byName = {};
  local.forEach((e) => { byName[e.name.toLowerCase()] = e.id; });

  const idMap = {};   // id importado -> id a usar localmente
  const toInsert = [];
  const unitUpdates = [];

  (d.exercises || []).forEach((e) => {
    if (!e || !e.name) return;
    const key = String(e.name).toLowerCase();
    if (byName[key]) {
      idMap[e.id] = byName[key];
      // Um backup mais recente pode trazer a unidade de um movimento que
      // já existe cá sem ela.
      if (e.unit) unitUpdates.push({ id: byName[key], unit: e.unit });
    } else {
      const record = {
        id: e.id || uid(),
        name: e.name,
        category: e.category || 'other',
        unit: e.unit || 'reps'
      };
      byName[key] = record.id;
      idMap[e.id] = record.id;
      toInsert.push(record);
      result.exercises++;
    }
  });

  await tx(['sessions', 'sets', 'wods', 'exercises', 'bodyMetrics', 'diet'], 'readwrite', (t) => {
    toInsert.forEach((e) => t.objectStore('exercises').put(e));
    unitUpdates.forEach((u) => {
      const found = local.find((x) => x.id === u.id);
      if (found && !found.unit) {
        t.objectStore('exercises').put(Object.assign({}, found, { unit: u.unit }));
      }
    });

    (d.sessions || []).forEach((s) => {
      if (!s || !s.id || !s.date) return;
      t.objectStore('sessions').put(s);
      result.sessions++;
    });

    (d.sets || []).forEach((s) => {
      if (!s || !s.id) return;
      const copy = Object.assign({}, s);
      if (idMap[copy.exerciseId]) copy.exerciseId = idMap[copy.exerciseId];
      t.objectStore('sets').put(copy);
      result.sets++;
    });

    (d.wods || []).forEach((w) => {
      if (!w || !w.id) return;
      // Os movimentos trazem exerciseId embutido e também têm de ser
      // reapontados, tal como as séries de força. Sem isto, importar um
      // backup num catálogo que já tem os mesmos nomes deixa todos os
      // movimentos dos WODs a apontar para ids inexistentes.
      const copy = Object.assign({}, w);
      if (Array.isArray(copy.movements)) {
        copy.movements = copy.movements.map((m) => {
          if (!m || !m.exerciseId || !idMap[m.exerciseId]) return m;
          return Object.assign({}, m, { exerciseId: idMap[m.exerciseId] });
        });
      }
      t.objectStore('wods').put(copy);
      result.wods++;
    });

    (d.bodyMetrics || []).forEach((b) => {
      if (!b || !b.date) return;
      t.objectStore('bodyMetrics').put(b);
      result.bodyMetrics++;
    });

    (d.diet || []).forEach((x) => {
      if (!x || !x.date) return;
      t.objectStore('diet').put(x);
      result.diet++;
    });
  });

  return result;
}

/* Apaga tudo menos as definições. Usado só pelo botão de reposição. */
function clearAllData() {
  return tx(['sessions', 'sets', 'wods', 'exercises', 'bodyMetrics', 'diet'], 'readwrite', (t) => {
    ['sessions', 'sets', 'wods', 'exercises', 'bodyMetrics', 'diet']
      .forEach((name) => t.objectStore(name).clear());
  });
}

/* Exposto num único objecto global para não poluir o window. */
const DB = {
  uid: uid,
  openDB: openDB,
  seedExercisesIfEmpty: seedExercisesIfEmpty,
  getExercises: getExercises,
  addExercise: addExercise,
  deleteExercise: deleteExercise,
  countSetsForExercise: countSetsForExercise,
  getSessions: getSessions,
  getSession: getSession,
  getSetsBySession: getSetsBySession,
  getWodsBySession: getWodsBySession,
  getAllSets: getAllSets,
  getAllWods: getAllWods,
  saveSession: saveSession,
  deleteSession: deleteSession,
  getBodyMetrics: getBodyMetrics,
  getBodyMetric: getBodyMetric,
  saveBodyMetric: saveBodyMetric,
  deleteBodyMetric: deleteBodyMetric,
  getDietDays: getDietDays,
  setDietDay: setDietDay,
  deleteDietDay: deleteDietDay,
  getSetting: getSetting,
  setSetting: setSetting,
  exportAll: exportAll,
  importAll: importAll,
  clearAllData: clearAllData
};
