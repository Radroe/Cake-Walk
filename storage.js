// Cake Walk: STORAGE, PROJECTS, SAVE, BACKUP, WORKER and OPFS
// IndexedDB holds all metadata. Video bytes live in OPFS, handled inside the Worker.
// SAVE is the one shared save system (Prompt 5): everything that changes saves through it, within a second.

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
  },
  // 1 -> 2: filmstrip thumbnails live in their own store, keyed by asset id
  (db) => {
    db.createObjectStore('thumbs');                         // assetId -> [Blob, ...]
  },
  // 2 -> 3: each project's undo history (last 200 steps), keyed by project id
  (db) => {
    db.createObjectStore('undo');                           // projectId -> { undo: [...], redo: [...] }
  },
  // 3 -> 4: no new stores (Prompt 6 adds look data inside each project record)
  () => {},
  // 4 -> 5: no new stores (Prompt 7: recipes live in meta 'recipes'; projects gain a recipe link and guide track)
  () => {}
];

// Step-by-step upgrades for the project records themselves. Entry n upgrades a project from schema n to n + 1.
// Old projects are upgraded when they're read, so an app update never breaks or erases them.
const PROJECT_MIGRATIONS = {
  // 1 -> 2: the timeline arrived (Prompt 2)
  1: (p) => { p.assets ||= {}; p.clips ||= []; p.music ??= null; p.caption ??= ''; },
  // 2 -> 3: target platform (Prompt 4) and last-opened time (Prompt 5)
  2: (p) => { p.platform ||= 'tiktok'; p.exportPicks ??= null; p.openedAt ||= p.updatedAt || p.createdAt || Date.now(); },
  // 3 -> 4: the look (Prompt 6): text overlays, stickers, the project grade and the preview ratio.
  // Per-clip color, framing and transition are added to a clip only when you set them (missing means natural, fill, cut).
  3: (p) => { p.texts ||= []; p.stickers ||= []; p.grade ||= 'natural'; p.viewRatio ||= '9:16'; p.lane = p.lane === 'CREATIVE' ? 'CREATIVE' : 'PRO'; },
  // 4 -> 5: Remix (Prompt 7): which recipe the project follows, and its muted guide track (never exported).
  4: (p) => { p.recipeId ??= null; p.guide ??= null; }
};

export function upgradeProject(p) {
  if (!p) return p;
  let v = p.schema || 1;
  while (v < CONFIG.SCHEMA_VERSION) {
    PROJECT_MIGRATIONS[v]?.(p);
    v++;
  }
  p.schema = CONFIG.SCHEMA_VERSION;
  return p;
}

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
    const all = (await STORAGE.getAll('projects')).map(upgradeProject);
    return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },
  async get(id) { return upgradeProject(await STORAGE.get('projects', id)); },
  async create({ name, lane = 'PRO' }) {
    const now = Date.now();
    const project = {
      id: crypto.randomUUID(),
      schema: CONFIG.SCHEMA_VERSION,
      name: (name || 'Untitled').trim(),
      lane,
      createdAt: now,
      updatedAt: now,
      assets: {},     // assetId -> what was imported (file path in OPFS, size, codec, length)
      clips: [],      // the timeline, in order: { id, assetId, in, out, speed, volume, muted, color?, frame?, transition? }
      music: null,    // { assetId, volume, fadeIn, fadeOut }
      caption: '',
      platform: 'tiktok',
      exportPicks: null,
      openedAt: now,
      texts: [],      // text overlays (Prompt 6): { id, text, font, color, style, outline, shadow, x, y, size, start, end }
      stickers: [],   // CREATIVE stickers: { id, kind, x, y, size, rot, start, end }
      grade: 'natural',
      viewRatio: '9:16',
      recipeId: null, // Remix (Prompt 7): the recipe whose timing this project follows
      guide: null     // { recipeId, path, name, duration, hear } the reference's sound, for timing only, never exported
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
  async remove(id) {
    await STORAGE.del('projects', id);
    await STORAGE.del('undo', id).catch(() => {});
  },
  // OPFS paths a project uses (its clips and music).
  paths(p) { return Object.values(p?.assets || {}).map((a) => a.path).filter(Boolean); }
};

// ---------- SAVE: the one shared save system (Prompt 5) ----------
// SAVE.queue(key, fn) runs fn within a second of the last change for that key (autosave, the real safety net).
// SAVE.flush() runs everything waiting right now: on hide, on pagehide and before an update (a bonus, because
// iOS may close the app before those finish). Recipes, templates and anything later saves through here too.

const saveJobs = new Map();   // key -> { fn, timer }
const saveListeners = new Set();
let saveFailNotified = 0;

async function runJob(key) {
  const job = saveJobs.get(key);
  if (!job) return;
  saveJobs.delete(key);
  clearTimeout(job.timer);
  try {
    await job.fn();
    saveListeners.forEach((l) => l({ key, ok: true }));
  } catch (err) {
    saveListeners.forEach((l) => l({ key, ok: false, error: err }));
    if (Date.now() - saveFailNotified > 5000) saveFailNotified = Date.now();
    throw err;
  }
}

export const SAVE = {
  queue(key, fn, delay = 500) {
    const prev = saveJobs.get(key);
    if (prev) clearTimeout(prev.timer);
    const job = { fn, timer: setTimeout(() => runJob(key).catch(() => {}), Math.min(delay, 1000)) };
    saveJobs.set(key, job);
  },
  async now(key, fn) {
    SAVE.queue(key, fn);
    return runJob(key);
  },
  async flush() {
    const keys = [...saveJobs.keys()];
    const results = await Promise.allSettled(keys.map((k) => runJob(k)));
    return results.every((r) => r.status === 'fulfilled');
  },
  get pending() { return saveJobs.size; },
  onResult(fn) { saveListeners.add(fn); return () => saveListeners.delete(fn); }
};

// ---------- RECIPES: edit recipes from Remix (Prompt 7), saved through SAVE with their own schema ----------
// A recipe is timing only: { id, schema, name, link, refPath, refName, refSize, duration, crop, cuts, beats, bpm,
// beatSource, createdAt, updatedAt }. The reference video stays in OPFS (refs/) until its recipe is deleted.

export const RECIPE_SCHEMA = 1;
const RECIPE_MIGRATIONS = {};   // n -> n + 1, added when the recipe shape changes
function upgradeRecipe(r) {
  let v = r.schema || 1;
  while (v < RECIPE_SCHEMA) { RECIPE_MIGRATIONS[v]?.(r); v++; }
  r.schema = RECIPE_SCHEMA;
  r.cuts ||= []; r.beats ||= []; r.link ??= ''; r.crop ||= { x0: 0, y0: 0, x1: 1, y1: 1 };
  return r;
}
let recipeCache = null;

export const RECIPES = {
  async list() {
    if (!recipeCache) recipeCache = ((await STORAGE.get('meta', 'recipes').catch(() => null)) || []).map(upgradeRecipe);
    return [...recipeCache].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },
  async get(id) { return (await RECIPES.list()).find((r) => r.id === id) || null; },
  // Saves within a second (SAVE.queue); pass now: true to write straight away.
  async save(recipe, { now = false } = {}) {
    await RECIPES.list();
    recipe.updatedAt = Date.now();
    recipe.schema = RECIPE_SCHEMA;
    const i = recipeCache.findIndex((r) => r.id === recipe.id);
    if (i >= 0) recipeCache[i] = recipe; else recipeCache.push(recipe);
    const write = () => STORAGE.put('meta', recipeCache, 'recipes');
    if (now) await SAVE.now('recipes', write); else SAVE.queue('recipes', write, 600);
    return recipe;
  },
  async remove(id) {
    await RECIPES.list();
    recipeCache = recipeCache.filter((r) => r.id !== id);
    await SAVE.now('recipes', () => STORAGE.put('meta', recipeCache, 'recipes'));
  },
  forget() { recipeCache = null; },   // after a Restore
  // OPFS paths recipes keep (reference videos and any song used for beats).
  async paths() { return (await RECIPES.list()).flatMap((r) => [r.refPath, r.beatPath]).filter(Boolean); }
};

// Where you were: screen, project, playhead, selection and open panel. Restored on relaunch.
export const SESSION = {
  async get() { try { return await STORAGE.get('meta', 'session'); } catch { return null; } },
  set(patch) {
    SESSION.current = { ...(SESSION.current || {}), ...patch, at: Date.now() };
    SAVE.queue('session', () => STORAGE.put('meta', SESSION.current, 'session'), 700);
  },
  current: null
};

// Undo history per project.
export const UNDO = {
  async load(projectId) { try { return (await STORAGE.get('undo', projectId)) || { undo: [], redo: [] }; } catch { return { undo: [], redo: [] }; } },
  save(projectId, undo, redo) {
    SAVE.queue(`undo:${projectId}`, () => STORAGE.put('undo', { undo: undo.slice(-CONFIG.EDITOR.UNDO_LIMIT), redo: redo.slice(-CONFIG.EDITOR.UNDO_LIMIT) }, projectId), 900);
  }
};

// ---------- BACKUP: edit data only (projects, templates, settings), never clips, the AI key or the chibi ----------

const SECRET_SETTING = /key|chibi|token|secret/i;

export const BACKUP = {
  KIND: 'cakewalk-backup',
  async make() {
    const projects = await PROJECTS.list();
    const settings = await STORAGE.loadSettings();
    const safeSettings = Object.fromEntries(Object.entries(settings).filter(([k]) => !SECRET_SETTING.test(k)));
    const templates = (await STORAGE.get('meta', 'templates').catch(() => null)) || [];
    const recipes = (await STORAGE.get('meta', 'recipes').catch(() => null)) || [];
    return {
      kind: BACKUP.KIND, app: CONFIG.APP_NAME, appVersion: CONFIG.APP_VERSION, schema: CONFIG.SCHEMA_VERSION,
      at: new Date().toISOString(), projects, templates, recipes, settings: safeSettings
    };
  },
  // Returns { projects: n, renamed: n }. Clips aren't in a backup, so restored projects ask for them again.
  async restore(data) {
    if (!data || data.kind !== BACKUP.KIND || !Array.isArray(data.projects)) throw new Error('This isn\'t a Cake Walk backup file.');
    const existing = new Set((await STORAGE.getAllKeys('projects')));
    let renamed = 0;
    for (const raw of data.projects) {
      const p = upgradeProject(JSON.parse(JSON.stringify(raw)));
      if (!p.id || existing.has(p.id)) { p.id = crypto.randomUUID(); p.name = `${p.name || 'Project'} (restored)`; renamed++; }
      p.restoredAt = Date.now();
      await STORAGE.put('projects', p);
    }
    for (const [k, v] of Object.entries(data.settings || {})) if (!SECRET_SETTING.test(k)) await STORAGE.saveSetting(k, v);
    if (Array.isArray(data.templates) && data.templates.length) await STORAGE.put('meta', data.templates, 'templates');
    if (Array.isArray(data.recipes) && data.recipes.length) { await STORAGE.put('meta', data.recipes, 'recipes'); RECIPES.forget(); }
    return { projects: data.projects.length, renamed };
  }
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
  list() { return WORKER.call('opfs.list', {}, [], 60000); },              // [{ path, size }]

  // Read a finished file straight from the main page (for the preview player and sharing).
  async file(path) {
    const parts = String(path).split('/').filter(Boolean);
    let dir = await navigator.storage.getDirectory();
    for (const d of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(d);
    const fh = await dir.getFileHandle(parts[parts.length - 1]);
    return fh.getFile();
  },

  // Copy a picked file into OPFS in chunks, with progress and Cancel.
  // onProgress(fraction). Throws AbortError if cancelled; the half-copied file is deleted.
  async copyIn(file, path, { onProgress, signal, chunk = CONFIG.EDITOR.COPY_CHUNK } = {}) {
    let offset = 0;
    try {
      while (offset < file.size) {
        if (signal?.aborted) throw new DOMException('Import cancelled', 'AbortError');
        const buf = await file.slice(offset, offset + chunk).arrayBuffer();
        const len = buf.byteLength;   // read before the write: handing buf to the Worker empties it here
        if (!len) throw new Error('The file stopped reading partway');
        await OPFS.write(path, offset, buf);
        offset += len;
        onProgress?.(file.size ? offset / file.size : 1);
      }
      await OPFS.close(path);
      return offset;
    } catch (err) {
      await OPFS.remove(path).catch(() => {});
      throw err;
    }
  }
};

// ---------- Thumbnails (filmstrip pictures, per imported clip) ----------

export const THUMBS = {
  get(assetId) { return STORAGE.get('thumbs', assetId); },
  put(assetId, blobs) { return STORAGE.put('thumbs', blobs, assetId); },
  remove(assetId) { return STORAGE.del('thumbs', assetId); }
};
