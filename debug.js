// Cake Walk: DEBUG
// Error log, capability checks and (Prompt 11) the performance test.
// The log and its Copy button NEVER include Settings details, handles, the AI key or the chibi.

import { CONFIG } from './config.js';
import { STORAGE, WORKER } from './storage.js';

const early = [];          // entries logged before IndexedDB is ready
let dbReady = false;
let lastCaps = null;

function now() { return new Date().toISOString(); }

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms))
  ]);
}

async function writeEntry(entry) {
  try {
    await STORAGE.add('log', entry);
    const count = await STORAGE.count('log');
    if (count > CONFIG.LOG_LIMIT) {
      const keys = await STORAGE.getAllKeys('log');
      for (const k of keys.slice(0, count - CONFIG.LOG_LIMIT)) await STORAGE.del('log', k);
    }
  } catch (err) {
    console.warn('Could not save log entry', err);
  }
}

// ---------- Capability checks ----------

async function checkVideoEncode(t) {
  if (typeof VideoEncoder === 'undefined') return { ok: false, detail: 'VideoEncoder missing' };
  const config = { codec: t.codec, width: t.width, height: t.height, bitrate: t.bitrate, framerate: t.framerate, avc: { format: 'avc' } };
  const r = await withTimeout(VideoEncoder.isConfigSupported(config), 8000, t.label);
  return { ok: !!r.supported, detail: `${t.codec}${r.supported ? '' : ' not supported'}` };
}

async function checkAudioEncode(t) {
  if (typeof AudioEncoder === 'undefined') return { ok: false, detail: 'AudioEncoder missing' };
  const config = { codec: t.codec, sampleRate: t.sampleRate, numberOfChannels: t.numberOfChannels, bitrate: t.bitrate };
  const r = await withTimeout(AudioEncoder.isConfigSupported(config), 8000, t.label);
  return { ok: !!r.supported, detail: `${t.codec}${r.supported ? '' : ' not supported'}` };
}

async function checkVideoDecode(t) {
  if (typeof VideoDecoder === 'undefined') return { ok: false, detail: 'VideoDecoder missing' };
  for (const codec of [t.codec, t.alt].filter(Boolean)) {
    const r = await withTimeout(VideoDecoder.isConfigSupported({ codec, codedWidth: t.codedWidth, codedHeight: t.codedHeight }), 8000, t.label);
    if (r.supported) return { ok: true, detail: codec };
  }
  return { ok: false, detail: `${t.codec} not supported` };
}

async function safe(fn) {
  try { return await fn(); } catch (err) { return { ok: false, detail: `${err.name}: ${err.message}` }; }
}

const LABELS = {
  aac_encode: CONFIG.AUDIO_ENCODE_TEST.label,
  audio_decoder: 'AudioDecoder available',
  opfs_sync: 'OPFS with createSyncAccessHandle (in Worker)',
  opfs_writable: 'OPFS createWritable (optional)',
  offscreen_webgl2: 'OffscreenCanvas with WebGL2 (in Worker)',
  mediabunny: 'Mediabunny module (in Worker)',
  wake_lock: 'Screen Wake Lock',
  can_share: 'Share sheet with a test file',
  worker: 'Worker started'
};
CONFIG.VIDEO_ENCODE_TESTS.forEach((t) => { LABELS[t.key] = t.label; });
CONFIG.VIDEO_DECODE_TESTS.forEach((t) => { LABELS[t.key] = t.label; });

export const DEBUG = {
  init() {
    window.addEventListener('error', (e) => {
      DEBUG.log('error', e.message || 'Script error', e.filename ? `${e.filename.split('/').pop()}:${e.lineno}` : '');
    });
    window.addEventListener('unhandledrejection', (e) => {
      const r = e.reason;
      DEBUG.log('error', r?.message || String(r), r?.name || 'Promise');
    });
  },

  async ready() {
    dbReady = true;
    for (const entry of early.splice(0)) await writeEntry(entry);
    const noted = await STORAGE.get('meta', 'storageNoteLogged');
    if (!noted) {
      await DEBUG.log('info', 'Note: the Home Screen app and the browser keep separate storage.');
      await STORAGE.put('meta', true, 'storageNoteLogged');
    }
  },

  // level: 'info' | 'warn' | 'error'. Never pass Settings values here.
  async log(level, msg, where = '') {
    const entry = { t: now(), level, msg: String(msg).slice(0, 500), where: String(where).slice(0, 120), v: CONFIG.APP_VERSION };
    if (level === 'error') console.error(entry.msg, entry.where);
    if (!dbReady) { early.push(entry); return; }
    await writeEntry(entry);
  },

  async runChecks() {
    const results = {};
    for (const t of CONFIG.VIDEO_ENCODE_TESTS) results[t.key] = await safe(() => checkVideoEncode(t));
    results.aac_encode = await safe(() => checkAudioEncode(CONFIG.AUDIO_ENCODE_TEST));
    results.audio_decoder = { ok: typeof AudioDecoder === 'function', detail: typeof AudioDecoder === 'function' ? 'Ready' : 'Missing' };
    for (const t of CONFIG.VIDEO_DECODE_TESTS) results[t.key] = await safe(() => checkVideoDecode(t));

    // Worker checks: OPFS, OffscreenCanvas WebGL2, Mediabunny.
    try {
      const w = await WORKER.call('caps', {}, [], 25000);
      results.worker = { ok: true, detail: 'Module worker running' };
      Object.assign(results, w);
    } catch (err) {
      results.worker = { ok: false, detail: err.message };
      results.opfs_sync = { ok: false, detail: 'Worker did not answer' };
    }

    results.wake_lock = { ok: 'wakeLock' in navigator, detail: 'wakeLock' in navigator ? 'Available' : 'Missing' };
    results.can_share = await safe(async () => {
      if (!navigator.canShare) return { ok: false, detail: 'navigator.canShare missing' };
      const file = new File([new Uint8Array(16)], 'cakewalk-test.mp4', { type: 'video/mp4' });
      const ok = navigator.canShare({ files: [file] });
      return { ok, detail: ok ? 'Can share video files' : 'Sharing files is not allowed' };
    });

    lastCaps = { at: now(), version: CONFIG.APP_VERSION, results };
    try { await STORAGE.put('meta', lastCaps, 'caps'); } catch {}
    const failed = Object.entries(results).filter(([, r]) => !r.ok && !r.optional).map(([k]) => k);
    await DEBUG.log(failed.length ? 'warn' : 'info', failed.length ? `Capability checks: missing ${failed.join(', ')}` : 'Capability checks: all passed');
    return lastCaps;
  },

  async getCaps() {
    if (lastCaps) return lastCaps;
    try { lastCaps = await STORAGE.get('meta', 'caps'); } catch {}
    return lastCaps;
  },

  // Plain-words messages for anything Cake Walk can't work without.
  problems(caps) {
    const r = caps?.results || {};
    const out = [];
    const missing = [];
    if (r.h264_1080p30 && !r.h264_1080p30.ok) missing.push('H.264 video export at 1080p');
    if (r.aac_encode && !r.aac_encode.ok) missing.push('AAC audio export');
    if (r.opfs_sync && !r.opfs_sync.ok) missing.push('private file storage (OPFS)');
    if (missing.length) {
      out.push(`This iPhone can't do ${missing.join(', ')} yet. Update iOS in Settings, General, Software Update, then open Cake Walk again.`);
    }
    if (r.hevc_decode && !r.hevc_decode.ok) {
      out.push('iPhone HEVC clips can\'t be edited on this phone. For clips meant for Cake Walk, set Settings, Camera, Formats to Most Compatible.');
    }
    return out;
  },

  async entries() {
    try { return (await STORAGE.getAll('log')).reverse(); } catch { return []; }
  },

  async clear() { await STORAGE.clear('log'); },

  // Text for the Copy button. Settings values are scrubbed out just in case.
  async report(settingsValues = []) {
    const caps = await DEBUG.getCaps();
    const est = await STORAGE.estimate();
    const persisted = await STORAGE.isPersisted();
    const lines = [];
    lines.push(`Cake Walk debug log`);
    lines.push(`App version: ${CONFIG.APP_VERSION}`);
    lines.push(`Copied: ${now()}`);
    lines.push(`Opened as: ${DEBUG.displayMode()}`);
    lines.push(`Device: ${navigator.userAgent}`);
    lines.push(`Mediabunny: ${CONFIG.MEDIABUNNY_VERSION} (${caps?.results?.mediabunny?.ok ? 'loaded' : 'not loaded'})`);
    if (est) lines.push(`Storage: used ${DEBUG.bytes(est.usage)}, free about ${DEBUG.bytes(Math.max(0, est.quota - est.usage))}`);
    lines.push(`Protected storage: ${persisted ? 'on' : 'off'}`);
    lines.push('');
    lines.push(`Capability checks (${caps?.at || 'not run'}):`);
    for (const [k, r] of Object.entries(caps?.results || {})) {
      lines.push(`  ${r.ok ? 'PASS' : r.optional ? 'NOTE' : 'FAIL'}  ${LABELS[k] || k}: ${r.detail || ''}`);
    }
    lines.push('');
    lines.push('Log (newest first):');
    for (const e of (await DEBUG.entries()).slice(0, 150)) {
      lines.push(`  ${e.t} [${e.level}] v${e.v} ${e.msg}${e.where ? ` (${e.where})` : ''}`);
    }
    let text = lines.join('\n');
    for (const v of settingsValues) {
      if (typeof v === 'string' && v.trim().length >= 3) text = text.split(v.trim()).join('[hidden]');
    }
    return text;
  },

  displayMode() {
    const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
    return standalone ? 'Home Screen app' : 'Browser tab';
  },

  bytes(n) {
    if (!Number.isFinite(n)) return 'unknown';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
  },

  label(key) { return LABELS[key] || key; }
};
