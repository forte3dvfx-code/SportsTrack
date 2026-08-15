/* db.js — camada de persistência (IndexedDB)
 * Todas as funções devolvem Promises. Sem dependências externas.
 *
 * VERSÃO 2: acrescenta a store 'settings'. A migração é aditiva —
 * os dados já gravados na versão 1 mantêm-se intactos. */

const DB_NAME = 'treino-db';
const DB_VERSION = 2;

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
  ['Back Squat', 'barbell'],
  ['Front Squat', 'barbell'],
  ['Overhead Squat', 'barbell'],
  ['Deadlift', 'barbell'],
  ['Sumo Deadlift High Pull', 'barbell'],
  ['Clean', 'barbell'],
  ['Power Clean', 'barbell'],
  ['Hang Power Clean', 'barbell'],
  ['Clean and Jerk', 'barbell'],
  ['Snatch', 'barbell'],
  ['Power Snatch', 'barbell'],
  ['Push Press', 'barbell'],
  ['Push Jerk', 'barbell'],
  ['Split Jerk', 'barbell'],
  ['Strict Press', 'barbell'],
  ['Bench Press', 'barbell'],
  ['Thruster', 'barbell'],
  ['Bent Over Row', 'barbell'],
  ['Dumbbell Snatch', 'dumbbell'],
  ['Dumbbell Thruster', 'dumbbell'],
  ['Devil Press', 'dumbbell'],
  ['Kettlebell Swing', 'dumbbell'],
  ['Goblet Squat', 'dumbbell'],
  ['Farmers Carry', 'dumbbell'],
  ['Pull-up', 'gymnastics'],
  ['Chest to Bar', 'gymnastics'],
  ['Muscle-up', 'gymnastics'],
  ['Ring Muscle-up', 'gymnastics'],
  ['Toes to Bar', 'gymnastics'],
  ['Handstand Push-up', 'gymnastics'],
  ['Handstand Walk', 'gymnastics'],
  ['Ring Dip', 'gymnastics'],
  ['Push-up', 'gymnastics'],
  ['Box Jump', 'other'],
  ['Wall Ball', 'other'],
  ['Rope Climb', 'other'],
  ['GHD Sit-up', 'other'],
  ['Back Extension', 'other']
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
    SEED_EXERCISES.forEach(([name, category]) => {
      store.put({ id: uid(), name, category });
    });
  });
  return getExercises();
}

function getExercises() {
  return getAll('exercises').then((rows) =>
    rows.sort((a, b) => a.name.localeCompare(b.name, 'en'))
  );
}

async function addExercise(name, category) {
  const record = { id: uid(), name: name.trim(), category: category || 'other' };
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
  const [sessions, sets, wods, exercisesRows, bodyMetrics] = await Promise.all([
    getAll('sessions'), getAll('sets'), getAll('wods'),
    getAll('exercises'), getAll('bodyMetrics')
  ]);
  return {
    app: 'treino',
    schema: 2,
    exportedAt: new Date().toISOString(),
    data: {
      sessions: sessions,
      sets: sets,
      wods: wods,
      exercises: exercisesRows,
      bodyMetrics: bodyMetrics
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
  const result = { sessions: 0, sets: 0, wods: 0, exercises: 0, bodyMetrics: 0 };

  const local = await getExercises();
  const byName = {};
  local.forEach((e) => { byName[e.name.toLowerCase()] = e.id; });

  const idMap = {};   // id importado -> id a usar localmente
  const toInsert = [];

  (d.exercises || []).forEach((e) => {
    if (!e || !e.name) return;
    const key = String(e.name).toLowerCase();
    if (byName[key]) {
      idMap[e.id] = byName[key];
    } else {
      const record = { id: e.id || uid(), name: e.name, category: e.category || 'other' };
      byName[key] = record.id;
      idMap[e.id] = record.id;
      toInsert.push(record);
      result.exercises++;
    }
  });

  await tx(['sessions', 'sets', 'wods', 'exercises', 'bodyMetrics'], 'readwrite', (t) => {
    toInsert.forEach((e) => t.objectStore('exercises').put(e));

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
      t.objectStore('wods').put(w);
      result.wods++;
    });

    (d.bodyMetrics || []).forEach((b) => {
      if (!b || !b.date) return;
      t.objectStore('bodyMetrics').put(b);
      result.bodyMetrics++;
    });
  });

  return result;
}

/* Apaga tudo menos as definições. Usado só pelo botão de reposição. */
function clearAllData() {
  return tx(['sessions', 'sets', 'wods', 'exercises', 'bodyMetrics'], 'readwrite', (t) => {
    ['sessions', 'sets', 'wods', 'exercises', 'bodyMetrics']
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
  getSetting: getSetting,
  setSetting: setSetting,
  exportAll: exportAll,
  importAll: importAll,
  clearAllData: clearAllData
};
