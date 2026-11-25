// Cake Walk: the Web Worker (module worker)
// Decodes, draws, encodes and analyzes video (Prompts 2 onward), and owns all OPFS work.
// Every message: { id, type, payload }. Every reply: { id, ok, result } or { id, ok: false, error }.

import { CONFIG } from './config.js';

const handlers = {};
let mediabunny = null;

// ---------- Mediabunny ----------

async function loadMediabunny() {
  if (mediabunny) return mediabunny;
  // Loaded only when needed, so the app still opens if the CDN is unreachable.
  // The service worker caches this exact URL for offline use. // VERIFY offline load inside the Worker on iOS.
  mediabunny = await import(CONFIG.MEDIABUNNY_URL);
  return mediabunny;
}

handlers['mediabunny.load'] = async () => {
  const mb = await loadMediabunny();
  const ok = typeof mb.Input === 'function' && typeof mb.Output === 'function' && !!mb.ALL_FORMATS;
  return { ok, version: CONFIG.MEDIABUNNY_VERSION, url: CONFIG.MEDIABUNNY_URL, exports: Object.keys(mb).length };
};

// ---------- OPFS helpers ----------

const openHandles = new Map(); // path -> FileSystemSyncAccessHandle

async function root() {
  return navigator.storage.getDirectory();
}

function splitPath(path) {
  const parts = String(path).split('/').filter(Boolean);
  if (!parts.length || parts.some((p) => p === '.' || p === '..')) throw new Error('Bad file path');
  return { dirs: parts.slice(0, -1), name: parts[parts.length - 1] };
}

async function getDir(dirs, create) {
  let dir = await root();
  for (const d of dirs) dir = await dir.getDirectoryHandle(d, { create });
  return dir;
}

async function getFileHandle(path, create) {
  const { dirs, name } = splitPath(path);
  const dir = await getDir(dirs, create);
  return dir.getFileHandle(name, { create });
}

async function getAccessHandle(path) {
  if (openHandles.has(path)) return openHandles.get(path);
  const fh = await getFileHandle(path, true);
  const ah = await fh.createSyncAccessHandle();
  openHandles.set(path, ah);
  return ah;
}

function closeHandle(path) {
  const ah = openHandles.get(path);
  if (!ah) return;
  try { ah.flush(); } finally { ah.close(); openHandles.delete(path); }
}

handlers['opfs.write'] = async ({ path, offset, buffer }) => {
  const ah = await getAccessHandle(path);
  const view = new Uint8Array(buffer);
  let written = 0;
  try {
    while (written < view.byteLength) {
      const n = ah.write(view.subarray(written), { at: offset + written });
      if (!n) throw new Error('Nothing was written');
      written += n;
    }
  } catch (err) {
    // QuotaExceededError and friends: close cleanly and pass the real error name back.
    closeHandle(path);
    throw err;
  }
  return { written };
};

handlers['opfs.close'] = async ({ path }) => { closeHandle(path); return true; };

handlers['opfs.read'] = async ({ path }) => {
  closeHandle(path);
  const fh = await getFileHandle(path, false);
  return fh.getFile();
};

handlers['opfs.size'] = async ({ path }) => {
  if (openHandles.has(path)) return openHandles.get(path).getSize();
  const fh = await getFileHandle(path, false);
  return (await fh.getFile()).size;
};

handlers['opfs.remove'] = async ({ path }) => {
  closeHandle(path);
  const { dirs, name } = splitPath(path);
  const dir = await getDir(dirs, false);
  await dir.removeEntry(name, { recursive: true });
  return true;
};

handlers['opfs.list'] = async () => {
  const out = [];
  async function walk(dir, prefix) {
    for await (const [name, handle] of dir.entries()) {
      const p = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'directory') await walk(handle, p);
      else out.push({ path: p, size: (await handle.getFile()).size });
    }
  }
  await walk(await root(), '');
  return out;
};

// ---------- Capability checks that only make sense inside the Worker ----------

handlers['caps'] = async () => {
  const result = {};

  // OPFS with createSyncAccessHandle: write, read back, delete a tiny test file.
  try {
    const dir = await root();
    const fh = await dir.getFileHandle('.cakewalk-selftest', { create: true });
    const ah = await fh.createSyncAccessHandle();
    const data = new Uint8Array([67, 87, 49, 33]);
    ah.write(data, { at: 0 });
    ah.flush();
    const back = new Uint8Array(4);
    ah.read(back, { at: 0 });
    ah.close();
    await dir.removeEntry('.cakewalk-selftest');
    const same = back.every((b, i) => b === data[i]);
    result.opfs_sync = { ok: same, detail: same ? 'Write and read back worked' : 'Read back did not match' };
  } catch (err) {
    result.opfs_sync = { ok: false, detail: `${err.name}: ${err.message}` };
  }
  // createWritable may be missing on iOS WebKit; we never depend on it. // VERIFY
  result.opfs_writable = {
    ok: typeof FileSystemFileHandle !== 'undefined' && 'createWritable' in FileSystemFileHandle.prototype,
    detail: 'Optional. Cake Walk uses createSyncAccessHandle instead.',
    optional: true
  };

  // OffscreenCanvas with WebGL2.
  try {
    const gl = new OffscreenCanvas(16, 16).getContext('webgl2');
    result.offscreen_webgl2 = { ok: !!gl, detail: gl ? 'WebGL2 ready' : 'getContext returned null' };
  } catch (err) {
    result.offscreen_webgl2 = { ok: false, detail: `${err.name}: ${err.message}` };
  }

  // Mediabunny loads as a module inside this Worker.
  try {
    const mb = await handlers['mediabunny.load']();
    result.mediabunny = { ok: mb.ok, detail: `Version ${mb.version} loaded` };
  } catch (err) {
    result.mediabunny = { ok: false, detail: `Could not load: ${err.message}` };
  }

  return result;
};

handlers['ping'] = async () => ({ pong: true, version: CONFIG.APP_VERSION });

// ---------- Message loop ----------

self.onmessage = async (e) => {
  const { id, type, payload } = e.data || {};
  const fn = handlers[type];
  if (!fn) {
    self.postMessage({ id, ok: false, error: { name: 'Error', message: `Unknown task: ${type}` } });
    return;
  }
  try {
    const result = await fn(payload || {});
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: { name: err?.name || 'Error', message: err?.message || String(err) } });
  }
};
