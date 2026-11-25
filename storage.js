// Cake Walk: STORAGE, PROJECTS, WORKER and OPFS
// IndexedDB holds all metadata. Video bytes live in OPFS, handled inside the Worker.
// Prompt 5 hardens this into the one shared save system.

import { CONFIG } from './config.js';

// ---------- IndexedDB ----------

// Step-by-step schema upgrades. Each entry upgrades from (index) to (index + 1).
// Never edit an old step; add a new one and raise CONFIG.SCHEMA_VERSION.
const MIGRATIONS = [
  // 0 -> 1: first schema
  (db) => {
    db.createObjectStore('meta');                           // key/value app data
    db.createObjectStore('settings');                       // key/value Settings (stays on the phone)
    db.createObjectStore('projects', { keyPath: 'id' });    // one record per project
    db.createObjectStore('log', { keyPath: 'id', autoIncrement: true }); // Debug log
  }
];

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(CONFIG.DB_NAME, CONFIG.SCHEMA_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      for (let v = e.oldVersion; v < CONFIG.SCHEMA_VERSION; v++) MIGRATIONS[v](db, req.transaction);
    };
    req.onsuccess = () => {
      const db = req.result;
      // If another copy of the app upgrades the schema, close so it can proceed.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => console.warn('IndexedDB upgrade blocked by another open copy');
  });
  return dbPromise;
}

function done(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export const STORAGE = {
  openDB,
  async get(storeName, key) { return done((await store(storeName)).get(key)); },
  async put(storeName, value, key) {
    const s = await store(storeName, 'readwrite');
    return done(key === undefined ? s.put(value) : s.put(value, key));
  },
  async add(storeName, value) { return done((await store(storeName, 'readwrite')).add(value)); },
  async del(storeName, key) { return done((await store(storeName, 'readwrite')).delete(key)); },
  async getAll(storeName) { return done((await store(storeName)).getAll()); },
  async getAllKeys(storeName) { return done((await store(storeName)).getAllKeys()); },
  async count(storeName) { return done((await store(storeName)).count()); },
  async clear(storeName) { return done((await store(storeName, 'readwrite')).clear()); },

  // Settings: plain key/value pairs, never sent anywhere.
  async loadSettings() {
    const s = await store('settings');
    const keys = await done(s.getAllKeys());
    const vals = await done(s.getAll());
    const out = {};
    keys.forEach((k, i) => { out[k] = vals[i]; });
    return out;
  },
  async saveSetting(key, value) { return STORAGE.put('settings', value, key); },

  // Storage protection and space.
  async persist() {
    if (!navigator.storage?.persist) return false;
    try { return await navigator.storage.persist(); } catch { return false; }
  },
  async isPersisted() {
    if (!navigator.storage?.persisted) return false;
    try { return await navigator.storage.persisted(); } catch { return false; }
  },
  async estimate() {
    if (!navigator.storage?.estimate) return null;
    try { return await navigator.storage.estimate(); } catch { return null; }
  }
};

// ---------- Projects (metadata only) ----------

export const PROJECTS = {
  async list() {
    const all = await STORAGE.getAll('projects');
    return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },
  async get(id) { return STORAGE.get('projects', id); },
  async create({ name, lane = 'PRO' }) {
    const now = Date.now();
    const project = {
      id: crypto.randomUUID(),
      schema: CONFIG.SCHEMA_VERSION,
      name: (name || 'Untitled').trim(),
      lane,
      createdAt: now,
      updatedAt: now,
      clips: [],
      caption: ''
    };
    await STORAGE.put('projects', project);
    return project;
  },
  async save(project) {
    project.updatedAt = Date.now();
    project.schema = CONFIG.SCHEMA_VERSION;
    await STORAGE.put('projects', project);
    return project;
  },
  async remove(id) { return STORAGE.del('projects', id); }
};

// ---------- Worker client ----------
// One module Worker does decoding, drawing, encoding, analysis and all OPFS work.

let worker = null;
let nextId = 1;
const pending = new Map();
const listeners = new Set();

export const WORKER = {
  start() {
    if (worker) return worker;
    worker = new Worker('./worker.js', { type: 'module' });
    worker.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject, timer } = pending.get(msg.id);
        clearTimeout(timer);
        pending.delete(msg.id);
        if (msg.ok) resolve(msg.result);
        else reject(Object.assign(new Error(msg.error?.message || 'Worker error'), { name: msg.error?.name || 'Error' }));
      } else {
        listeners.forEach((fn) => fn(msg));
      }
    };
    worker.onerror = (e) => {
      listeners.forEach((fn) => fn({ type: 'worker-error', message: e.message || 'Worker failed to start' }));
    };
    return worker;
  },
  call(type, payload = {}, transfer = [], timeoutMs = 30000) {
    WORKER.start();
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Worker timed out on ${type}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, type, payload }, transfer);
    });
  },
  onEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); }
};

// ---------- OPFS (runs in the Worker with createSyncAccessHandle) ----------
// Paths are like "clips/abc.mov". Video files are never cached by the service worker.

export const OPFS = {
  // Write bytes at an offset. The file stays open until close() for fast chunked copies.
  write(path, offset, buffer) { return WORKER.call('opfs.write', { path, offset, buffer }, [buffer], 120000); },
  close(path) { return WORKER.call('opfs.close', { path }); },
  read(path) { return WORKER.call('opfs.read', { path }, [], 120000); },   // returns a File
  size(path) { return WORKER.call('opfs.size', { path }); },
  remove(path) { return WORKER.call('opfs.remove', { path }); },
  list() { return WORKER.call('opfs.list', {}, [], 60000); }               // [{ path, size }]
};
