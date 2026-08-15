/* db.js — camada de persistência (IndexedDB)
 * Todas as funções devolvem Promises. Sem dependências externas.
 */

const DB_NAME = 'treino-db';
const DB_VERSION = 1;

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
    };

    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

/* Helper genérico: corre uma operação numa store e devolve o resultado. */
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
  return openDB().then((db) => new Promise((resolve, reject) => {
    const req = db.transaction('exercises').objectStore('exercises').getAll();
    req.onsuccess = () => {
      // Ordem alfabética, para o selector ser previsível.
      resolve(req.result.sort((a, b) => a.name.localeCompare(b.name, 'en')));
    };
    req.onerror = () => reject(req.error);
  }));
}

async function addExercise(name, category) {
  const record = { id: uid(), name: name.trim(), category: category || 'other' };
  await tx('exercises', 'readwrite', (t) => t.objectStore('exercises').put(record));
  return record;
}

/* ---------- Sessões ---------- */

function getSessions() {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const req = db.transaction('sessions').objectStore('sessions').getAll();
    req.onsuccess = () => {
      // Mais recentes primeiro.
      resolve(req.result.sort((a, b) => b.date.localeCompare(a.date)));
    };
    req.onerror = () => reject(req.error);
  }));
}

function getSession(id) {
  return openDB().then((db) =>
    reqToPromise(db.transaction('sessions').objectStore('sessions').get(id))
  );
}

function getByIndex(storeName, indexName, value) {
  return openDB().then((db) =>
    reqToPromise(db.transaction(storeName).objectStore(storeName).index(indexName).getAll(value))
  );
}

function getSetsBySession(sessionId) {
  return getByIndex('sets', 'sessionId', sessionId)
    .then((rows) => rows.sort((a, b) => a.order - b.order));
}

function getWodsBySession(sessionId) {
  return getByIndex('wods', 'sessionId', sessionId);
}

/* Grava a sessão inteira: cabeçalho + séries + wod.
 * As séries e o wod anteriores são apagados e reescritos — é a forma mais
 * simples de manter tudo coerente numa app de um só utilizador. A alternativa
 * (diff registo a registo) seria mais código para zero ganho prático. */
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

/* ---------- Medições corporais (stores prontas, ecrã fica para a etapa seguinte) ---------- */

function getBodyMetrics() {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const req = db.transaction('bodyMetrics').objectStore('bodyMetrics').getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.date.localeCompare(a.date)));
    req.onerror = () => reject(req.error);
  }));
}

function saveBodyMetric(record) {
  return tx('bodyMetrics', 'readwrite', (t) => t.objectStore('bodyMetrics').put(record));
}

/* Exposto num único objecto global para não poluir o window. */
const DB = {
  uid,
  openDB,
  seedExercisesIfEmpty,
  getExercises,
  addExercise,
  getSessions,
  getSession,
  getSetsBySession,
  getWodsBySession,
  saveSession,
  deleteSession,
  getBodyMetrics,
  saveBodyMetric
};
