// Cake Walk: EXPORT (export screen, batch export, sharing)
// iOS pauses a web app as soon as it leaves the screen, so exports only run while Cake Walk is open and on screen.
// The Worker writes each MP4 straight into OPFS (fast start, space reserved up front). Nothing holds the whole video in memory.

import { CONFIG } from './config.js';
import { PROJECTS, OPFS, WORKER, STORAGE, SAVE } from './storage.js';
import { DEBUG } from './debug.js';
import { layout, totalLength, fmtBytes } from './editor.js';
import { PLATFORMS, PLATFORM_KEYS, exportRows, groupRows, storyRanges, specCheck, sourceLimits, fmtLen } from './platforms.js';

const X = CONFIG.EXPORT;
const $ = (sel, root = document) => root.querySelector(sel);

let ui = null;
let root = null;
let project = null;
let job = null;          // { id, cancelled }
let finished = [];       // [{ file, name }]
let wakeLock = null;

// ---------- Helpers ----------

function safeName(s) {
  return (s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'project';
}

let fpsChoice = 30;
let caps = null;

function settings() { return ui?.settings || {}; }

// Export choices save through the shared save system (Prompt 5), within a second.
function saveProject() {
  const p = project;
  if (p) SAVE.queue(`project:${p.id}`, () => PROJECTS.save(p), 400);
}

function rows(max) {
  return exportRows({
    segs: layout(project), length: totalLength(project), lane: project.lane,
    settings: settings(), caps, fps: fpsChoice, max
  });
}

// The clips between timeline seconds a and b (for Story parts), trimmed to fit.
function clipsInRange(a, b) {
  return layout(project).filter((s) => s.end > a + 1e-6 && s.start < b - 1e-6).map((s) => {
    const from = Math.max(a, s.start), to = Math.min(b, s.end);
    return {
      path: s.asset.path, kind: s.asset.kind,
      in: s.clip.in + (from - s.start) * s.clip.speed, out: s.clip.in + (to - s.start) * s.clip.speed,
      speed: s.clip.speed, volume: s.clip.volume ?? 1, muted: !!s.clip.muted
    };
  });
}

async function requestWake() {
  try { if ('wakeLock' in navigator && !document.hidden) wakeLock = await navigator.wakeLock.request('screen'); }
  catch (err) { DEBUG.log('warn', `Wake lock: ${err.name}`, 'export'); }
}
function onVisible() { if (job && !document.hidden) requestWake(); }

// ---------- Screen ----------

export const EXPORT = {
  get running() { return !!job; },

  // opts.autostart: Restart after the app closed mid-export (Prompt 5) starts right away with the saved picks.
  async render(container, uiApi, projectId, opts = {}) {
    ui = uiApi;
    project = projectId ? await PROJECTS.get(projectId) : null;
    container.innerHTML = '';
    if (!project || !project.clips?.length) {
      container.appendChild(ui.emptyState('Nothing to export yet.', 'Open a project and add a clip first.'));
      return;
    }
    root = document.getElementById('tpl-export').content.firstElementChild.cloneNode(true);
    container.appendChild(root);
    $('[data-slot="name"]', root).textContent = project.name;
    const cap = $('[data-slot="caption"]', root);
    cap.value = project.caption || '';
    cap.addEventListener('input', () => { project.caption = cap.value; saveProject(); });
    const maxBox = $('[data-slot="max"]', root);
    maxBox.checked = !!project.exportMax;
    maxBox.addEventListener('change', () => { project.exportMax = maxBox.checked; saveProject(); renderFormats(); });
    if (project.exportFps === 60 || project.exportFps === 30) fpsChoice = project.exportFps;
    root.addEventListener('click', onClick);
    caps = await DEBUG.getCaps().catch(() => null);
    renderFps();
    renderFormats();
    if (job) showRunning();
    else if (opts.autostart) start();
    else if (finished.length && finished.projectId === project.id) showDone();
  },

  // On launch: if the app closed during an export, delete the half-written files and return what was running,
  // so the app can ask "Restart it?" (Prompt 5).
  async cleanupInterrupted() {
    try {
      const rec = await STORAGE.get('meta', 'exportRunning');
      if (!rec) return null;
      for (const path of rec.paths || []) await OPFS.remove(path).catch(() => {});
      await STORAGE.del('meta', 'exportRunning');
      DEBUG.log('warn', 'An export stopped when the app closed. The half-written file was deleted.', 'export');
      return rec;
    } catch { return null; }
  }
};

function renderFps() {
  const box = $('[data-slot="fps"]', root);
  const lim = sourceLimits(layout(project));
  const can60 = lim.fps >= 50;
  if (!can60) fpsChoice = 30;
  box.innerHTML = '';
  for (const f of [30, 60]) {
    const b = document.createElement('button');
    b.className = `chip${fpsChoice === f ? ' on' : ''}`;
    b.textContent = `${f} fps`;
    b.disabled = f === 60 && !can60;
    b.addEventListener('click', () => { fpsChoice = f; project.exportFps = f; saveProject(); renderFps(); renderFormats(); });
    box.appendChild(b);
  }
  if (!can60) {
    const n = document.createElement('p');
    n.className = 'note';
    n.textContent = '60 fps needs a 60 fps clip. Cake Walk never goes above your clips\' frame rate.';
    box.appendChild(n);
  }
}

function picks() {
  if (Array.isArray(project.exportPicks) && project.exportPicks.length) return new Set(project.exportPicks);
  const p = PLATFORMS[project.platform || 'tiktok'] || PLATFORMS.tiktok;
  return new Set([`${project.platform || 'tiktok'}:${p.formats[0].key}`]);
}

function renderFormats() {
  if (!root) return;
  const box = $('[data-slot="formats"]', root);
  const max = $('[data-slot="max"]', root).checked;
  const chosen = picks();
  box.innerHTML = '';
  const total = totalLength(project);
  const all = rows(max);
  for (const key of PLATFORM_KEYS) {
    const group = all.filter((r) => r.platform === key);
    const st = group[0].status;
    const head = document.createElement('div');
    head.className = `fmt-head lvl-${st.level}`;
    head.innerHTML = '<b></b><small></small>';
    $('b', head).textContent = PLATFORMS[key].label;
    $('small', head).textContent = st.text || '';
    box.appendChild(head);
    for (const r of group) {
      const row = document.createElement('label');
      row.className = `switch fmt${r.unavailable ? ' off' : ''}`;
      row.innerHTML = '<input type="checkbox"><span><b></b><small class="muted"></small></span>';
      const input = $('input', row);
      input.value = r.id;
      input.disabled = !!r.unavailable;
      input.checked = !r.unavailable && chosen.has(r.id);
      $('b', row).textContent = r.label.includes(r.ratio) ? r.label : `${r.label} ${r.ratio}`;
      $('small', row).textContent = r.unavailable
        ? ` ${r.unavailable}`
        : ` ${r.width} x ${r.height} · ${r.fps} fps · ${r.bitrate / 1e6} Mbps${r.parts > 1 ? ` · ${r.parts} parts` : ''}${r.upscaleAvoided ? ' · sized to your clips (no upscaling)' : ''}${r.ratio !== '9:16' ? ` · your 9:16 edit is center-cropped to fill ${r.ratio}` : ''}`;
      input.addEventListener('change', () => {
        project.exportPicks = [...box.querySelectorAll('input:checked')].map((i) => i.value);
        saveProject();
        renderEstimate();
      });
      box.appendChild(row);
    }
  }
  renderEstimate();
}

function renderEstimate() {
  const total = totalLength(project);
  const groups = groupRows(selectedRows());
  const bytes = groups.reduce((a, g) => a + ((g.bitrate + g.audioBitrate) / 8) * total, 0);
  $('[data-slot="estimate"]', root).textContent = groups.length
    ? `${groups.length} file${groups.length === 1 ? '' : 's'}${groups.some((g) => g.parts > 1) ? ' (Story parts count as one)' : ''}, about ${fmtBytes(bytes)} for ${fmtLen(total)}. Same-size picks share one file.`
    : 'Pick at least one format.';
}

function selectedRows() {
  const keys = new Set([...root.querySelectorAll('[data-slot="formats"] input:checked')].map((i) => i.value));
  return rows($('[data-slot="max"]', root).checked).filter((r) => keys.has(r.id) && !r.unavailable);
}

function show(which) {
  for (const k of ['setup', 'running', 'done']) $(`[data-slot="${k}"]`, root)?.classList.toggle('hidden', k !== which);
}

function showRunning() { show('running'); $('[data-slot="walker"]', root).innerHTML = ui.sprinkleSVG(); }

function showDone() {
  show('done');
  const box = $('[data-slot="files"]', root);
  box.innerHTML = '';
  finished.forEach((f) => {
    const row = document.createElement('div');
    row.className = 'file-row';
    row.innerHTML = '<div class="grow"><b></b><div class="muted small"></div><div class="spec"></div></div><button class="btn btn-main">Share</button>';
    $('b', row).textContent = f.label;
    $('.muted', row).textContent = `${f.file.name} · ${fmtBytes(f.file.size)}`;
    const spec = $('.spec', row);
    if (f.spec) {
      const badge = document.createElement('span');
      badge.className = `pill ${f.spec.pass ? 'pill-green' : 'pill-amber'}`;
      badge.textContent = f.spec.pass ? 'Spec check passed' : 'Spec check: fix needed';
      spec.appendChild(badge);
      [...f.spec.fails, ...f.spec.notes].forEach((msg, i) => {
        const p = document.createElement('p');
        p.className = i < f.spec.fails.length ? 'spec-fail small' : 'spec-note small';
        p.textContent = msg;
        spec.appendChild(p);
      });
    } else if (f.specError) {
      spec.innerHTML = '<p class="spec-note small"></p>';
      $('p', spec).textContent = `Spec check couldn't read the file (${f.specError}).`;
    }
    $('button', row).addEventListener('click', () => share([f.file]));
    box.appendChild(row);
  });
}

// One tap: start copying the caption without waiting, then open the share sheet in the same tap.
function share(files) {
  const caption = project?.caption || '';
  if (caption && navigator.clipboard?.writeText) navigator.clipboard.writeText(caption).catch(() => {});
  if (!(navigator.canShare && navigator.canShare({ files }))) {
    ui.toast('This browser can\'t share files. Open Cake Walk from its Home Screen icon.');
    return;
  }
  navigator.share({ files }).then(() => markShared(files.map((f) => f.name))).catch((err) => {
    if (err.name === 'AbortError') return;
    DEBUG.log('warn', `Share: ${err.name} ${err.message}`, 'export');
    ui.toast('Tap Share again. Your caption is already copied.');
  });
}

// Storage suggests deleting exports you've already shared (Prompt 5).
async function markShared(names) {
  try {
    const list = new Set((await STORAGE.get('meta', 'exportsShared')) || []);
    names.forEach((n) => list.add(n));
    await STORAGE.put('meta', [...list].slice(-500), 'exportsShared');
  } catch {}
}

async function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b || !root?.contains(b)) return;
  const act = b.dataset.act;
  if (!act.startsWith('ex-')) return;
  e.stopPropagation();
  if (act === 'ex-back') { if (job) { ui.toast('Cancel the export first, or let it finish.'); return; } ui.go('editor', { id: project.id }); }
  else if (act === 'ex-start') start();
  else if (act === 'ex-cancel') cancel();
  else if (act === 'ex-saveall') share(finished.map((f) => f.file));
  else if (act === 'ex-again') { finished = []; show('setup'); renderFps(); renderFormats(); }
}

async function cancel() {
  if (!job) return;
  job.cancelled = true;
  await WORKER.call('export.cancel', { job: job.id }).catch(() => {});
}

async function start() {
  if (job) return;
  project.caption = $('[data-slot="caption"]', root).value;
  project.exportFps = fpsChoice;
  await SAVE.now(`project:${project.id}`, () => PROJECTS.save(project));
  const groups = groupRows(selectedRows());
  if (!groups.length) { ui.toast('Pick at least one format.'); return; }
  const total = totalLength(project);
  const warns = groups.flatMap((g) => g.members).filter((r) => r.status.level === 'warn');
  if (warns.length) {
    const ok = await ui.sheet({
      title: 'Heads up',
      text: [...new Set(warns.map((r) => `${r.platformLabel}: ${r.status.text}`))].join(' '),
      actions: [{ label: 'Go back', value: false }, { label: 'Export anyway', value: true, main: true }]
    });
    if (!ok) return;
  }

  // Space check: space used + 1.5 x the export size + 1 GB must fit.
  const need = groups.reduce((a, g) => a + ((g.bitrate + g.audioBitrate) / 8) * total, 0);
  const est = await STORAGE.estimate();
  if (est && est.quota && est.usage + need * 1.5 + 1e9 > est.quota) {
    const go = await ui.sheet({
      title: 'Space is tight',
      text: `This export needs about ${fmtBytes(need)}, and your iPhone is close to the limit for Cake Walk. Free up space first, or try anyway.`,
      actions: [{ label: 'Not now', value: false }, { label: 'Try anyway', value: true, main: true }]
    });
    if (!go) return;
  }

  const m = project.music && project.assets[project.music.assetId];
  const base = safeName(project.name);
  // One job per file. Story parts become numbered files.
  const jobs = [];
  for (const g of groups) {
    if (g.parts > 1) {
      const ranges = storyRanges(total, PLATFORMS[g.platform].cardMax);
      ranges.forEach(([a, b], i) => jobs.push({
        g, a, b, label: `${g.labels}, part ${i + 1} of ${ranges.length}`,
        name: `${base}_${g.format}_part${i + 1}of${ranges.length}_${g.width}x${g.height}_${g.fps}fps.mp4`
      }));
    } else {
      jobs.push({ g, a: 0, b: total, label: g.labels, name: `${base}_${g.tag}.mp4` });
    }
  }
  jobs.forEach((j) => { j.path = `exports/${j.name}`; });

  job = { id: crypto.randomUUID(), cancelled: false };
  finished = [];
  finished.projectId = project.id;
  await STORAGE.put('meta', { projectId: project.id, paths: jobs.map((j) => j.path), fps: fpsChoice, at: Date.now() }, 'exportRunning');
  await requestWake();
  document.addEventListener('visibilitychange', onVisible);
  showRunning();

  const bar = $('[data-slot="bar"]', root);
  const walker = $('[data-slot="walker"]', root);
  const pct = $('[data-slot="pct"]', root);
  const eta = $('[data-slot="eta"]', root);
  const label = $('[data-slot="run-label"]', root);
  // Progress weighs each file by its pixels times its length.
  const weights = jobs.map((j) => j.g.width * j.g.height * j.g.fps * (j.b - j.a));
  const weightSum = weights.reduce((a, w) => a + w, 0) || 1;
  let index = 0;
  const t0 = performance.now();
  const off = WORKER.onEvent((msg) => {
    if (msg.job !== job?.id) return;
    if (msg.type === 'export-note') DEBUG.log('warn', msg.message, 'export');
    if (msg.type !== 'export-progress') return;
    const before = weights.slice(0, index).reduce((a, w) => a + w, 0);
    const overall = Math.min(1, (before + weights[index] * msg.fraction) / weightSum);
    bar.style.width = `${(overall * 100).toFixed(1)}%`;
    walker.style.left = `calc(${(overall * 100).toFixed(1)}% - 22px)`;
    pct.textContent = `${Math.floor(overall * 100)}%`;
    const spent = (performance.now() - t0) / 1000;
    if (overall > 0.02) eta.textContent = `About ${Math.max(1, Math.round((spent / overall - spent)))}s left`;
  });

  let error = null;
  try {
    for (index = 0; index < jobs.length; index++) {
      const j = jobs[index];
      const g = j.g;
      label.textContent = jobs.length > 1 ? `Exporting ${index + 1} of ${jobs.length}: ${j.label}` : `Exporting ${j.label}`;
      const t1 = performance.now();
      const music = m ? {
        path: m.path, duration: m.duration, volume: project.music.volume, fadeIn: project.music.fadeIn, fadeOut: project.music.fadeOut,
        offset: j.a, fullLength: total
      } : null;
      const res = await WORKER.call('export.run', {
        job: job.id, clips: clipsInRange(j.a, j.b), music, width: g.width, height: g.height, fps: g.fps, bitrate: g.bitrate,
        audioBitrate: g.audioBitrate, keyFrameInterval: X.KEYFRAME_SECONDS, outPath: j.path, codecString: g.codecString
      }, [], 6 * 60 * 60 * 1000);
      DEBUG.log('info', `Exported ${j.name.replace(base, 'project')} ${fmtBytes(res.size)} ${res.duration.toFixed(1)}s in ${((performance.now() - t1) / 1000).toFixed(1)}s${res.audio === false ? ' (no audio: AAC encoder missing)' : ''}`, 'export');
      // SPEC CHECK: read the finished file back and compare it with the platform table.
      label.textContent = 'Checking the file';
      const entry = { label: j.label, path: j.path };
      try {
        const facts = await WORKER.call('export.check', { path: j.path }, [], 120000);
        entry.spec = specCheck(facts, { ...g, duration: j.b - j.a, lane: project.lane, settings: settings() });
        DEBUG.log(entry.spec.pass ? 'info' : 'warn', `Spec check ${entry.spec.pass ? 'passed' : 'failed'}: ${entry.spec.fails.join(' ') || 'all good'} [boxes ${facts.boxes}; color ${JSON.stringify(facts.video?.colorSpace || null)}; ${facts.video?.codecString}; keyframes ${facts.keyframes}]`, 'export');
      } catch (err) {
        entry.specError = err.message;
        DEBUG.log('warn', `Spec check: ${err.name} ${err.message}`, 'export');
      }
      // Read the finished file into a File right away, before any tap, so Share opens instantly.
      const raw = await OPFS.file(j.path);
      entry.file = new File([raw], j.name, { type: 'video/mp4' });
      finished.push(entry);
    }
  } catch (err) {
    error = err;
  } finally {
    off();
    document.removeEventListener('visibilitychange', onVisible);
    try { await wakeLock?.release(); } catch {}
    wakeLock = null;
    await STORAGE.del('meta', 'exportRunning').catch(() => {});
    job = null;
  }

  if (!root) return;
  if (error) {
    if (error.name === 'AbortError') { ui.toast('Export cancelled. The half-written file is gone.'); }
    else if (error.name === 'QuotaExceededError') {
      ui.sheet({ title: 'Out of space', text: 'Your iPhone ran out of room for this export, so it stopped cleanly. Free up space, then export again.', actions: [{ label: 'Got it', value: true, main: true }] });
    } else {
      DEBUG.log('error', `Export: ${error.name} ${error.message}`, 'export');
      ui.sheet({ title: 'Export hit a snag', text: `It stopped and cleaned up. Debug has the details for Claude. (${error.message})`, actions: [{ label: 'Got it', value: true, main: true }] });
    }
    if (finished.length) showDone(); else show('setup');
    return;
  }
  walker.classList.add('flip');
  ui.toast('Export done. You ate.', { sparkle: true, ms: 2600 });
  setTimeout(() => { if (root) showDone(); }, 900);
}
