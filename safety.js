// Cake Walk: SAFETY (Prompt 5): clip check and replace, load-failure counting, Recovery, Storage, Backup and Restore.
// New file because editor.js and app.js were already near the 1,000-line limit.
// Everything here saves through the shared save system in storage.js.

import { CONFIG } from './config.js';
import { STORAGE, PROJECTS, OPFS, WORKER, THUMBS, SAVE, BACKUP } from './storage.js';
import { DEBUG } from './debug.js';

const $ = (sel, root = document) => root.querySelector(sel);
const DAY = 86400000;
const OLD_PROJECT_DAYS = 30;

function bytes(n) { return DEBUG.bytes(n || 0); }
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function clone(id) { return document.getElementById(id).content.firstElementChild.cloneNode(true); }
function stamp() { return new Date().toISOString().slice(0, 10); }
function safeName(s) { return (s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'project'; }

function pick({ accept, multiple = false }) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve([...input.files]); input.remove(); });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); });
    document.body.appendChild(input);
    input.click();
  });
}

function extOf(file) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(file.name || '');
  if (m) return m[1].toLowerCase();
  if (file.type?.startsWith('image/')) return file.type.split('/')[1] || 'jpg';
  if (file.type === 'video/quicktime') return 'mov';
  return 'mp4';
}

// ---------- Clip check: every clip must be intact inside Cake Walk ----------

// Returns [{ asset, reason: 'missing' | 'damaged' }] for every clip or song the timeline uses.
export async function checkClips(project) {
  const used = new Set((project.clips || []).map((c) => c.assetId));
  if (project.music?.assetId) used.add(project.music.assetId);
  const out = [];
  for (const [id, asset] of Object.entries(project.assets || {})) {
    if (!used.has(id)) continue;
    let size = null;
    try { size = await OPFS.size(asset.path); } catch { size = null; }
    if (size == null) out.push({ asset, reason: 'missing' });
    else if (size === 0 || (asset.size && size !== asset.size)) out.push({ asset, reason: 'damaged' });
  }
  if (out.length) DEBUG.log('warn', `Clip check: ${out.length} missing or damaged (${out.map((m) => `${m.asset.kind} ${m.reason}`).join(', ')})`, 'safety');
  return out;
}

// One "Replace" button per missing clip. Picks the same clip again, copies it in, keeps your trims where they still fit.
export function missingSheet(ui, project, missing, onDone) {
  const body = el('div', 'missing');
  const restored = !!project.restoredAt;
  body.appendChild(el('p', 'muted', restored
    ? 'Backups hold your edit, not your clips. Pick each clip again from Files or Photos and your trims come right back.'
    : 'These are missing or damaged inside Cake Walk. Pick the same clip again from Files or Photos. Your trims stay.'));
  let replaced = 0;
  let left = missing.length;
  for (const m of missing) {
    const a = m.asset;
    const row = el('div', 'miss-row');
    const grow = el('div', 'grow');
    grow.append(el('b', null, a.name || (a.kind === 'audio' ? 'Song' : 'Clip')),
      el('div', 'muted small', `${a.kind === 'audio' ? 'Song' : a.kind === 'photo' ? 'Photo' : 'Clip'} · ${m.reason === 'missing' ? 'missing' : 'damaged'}${a.duration ? ` · ${a.duration.toFixed(1)}s` : ''}`));
    const btn = el('button', 'btn btn-sm btn-main', 'Replace');
    row.append(grow, btn);
    body.appendChild(row);
    btn.addEventListener('click', async () => {
      const files = await pick({ accept: a.kind === 'audio' ? 'audio/*' : a.kind === 'photo' ? 'image/*' : 'video/*' });
      if (!files.length) return;
      btn.disabled = true;
      const note = $('.muted', grow);
      try {
        await replaceAsset(project, a, files[0], (f) => { note.textContent = `Copying ${Math.round(f * 100)}%`; });
        note.textContent = 'Back in. Trims kept.';
        btn.textContent = 'Done';
        replaced++;
        left--;
        if (!left) $('.sheet .row .btn-main', document)?.click();
      } catch (err) {
        btn.disabled = false;
        note.textContent = err.userMessage || 'That didn\'t work. Try the clip again from Files.';
        DEBUG.log('warn', `Replace clip: ${err.name} ${err.message}`, 'safety');
      }
    });
  }
  ui.sheet({ title: missing.length === 1 ? 'One clip needs you' : `${missing.length} clips need you`, body, actions: [{ label: 'Later', value: false }, { label: 'Done', value: true, main: true }] })
    .then(() => { if (replaced) onDone?.(); if (left) ui.toast('Missing clips show as blank until you replace them.'); });
}

async function replaceAsset(project, asset, file, onProgress) {
  const path = `clips/${crypto.randomUUID().slice(0, 12)}.${extOf(file)}`;
  await OPFS.copyIn(file, path, { onProgress });
  let info;
  try {
    info = await WORKER.call('clip.probe', { path, type: file.type || '', photoSeconds: asset.kind === 'photo' ? asset.duration : 3 }, [], 120000);
  } catch (err) {
    await OPFS.remove(path).catch(() => {});
    throw Object.assign(err, { userMessage: 'Cake Walk couldn\'t read that file. Try Original quality from Files.' });
  }
  if (info.kind !== asset.kind) {
    await OPFS.remove(path).catch(() => {});
    throw Object.assign(new Error('kind mismatch'), { userMessage: `That's a ${info.kind}, and this spot needs a ${asset.kind}.` });
  }
  const oldPath = asset.path;
  Object.assign(asset, info, { path, name: file.name || asset.name, relinkedAt: Date.now() });
  // Keep trims where they fit in the new clip.
  for (const c of project.clips) {
    if (c.assetId !== asset.id) continue;
    c.out = Math.min(c.out, info.duration);
    c.in = Math.min(c.in, Math.max(0, c.out - 0.1));
  }
  await THUMBS.remove(asset.id).catch(() => {});
  await SAVE.now(`project:${project.id}`, () => PROJECTS.save(project));
  // The old file is gone or damaged; delete it unless another project still uses it.
  if (oldPath && !(await pathsInUse()).has(oldPath)) await OPFS.remove(oldPath).catch(() => {});
  DEBUG.log('info', `Replaced a ${asset.kind} (${info.width || ''}x${info.height || ''} ${info.codec || ''})`, 'safety');
}

async function pathsInUse() {
  const all = await PROJECTS.list().catch(() => []);
  return new Set(all.flatMap((p) => PROJECTS.paths(p)));
}

// ---------- Load counting: two failed loads in a row open Recovery instead of crashing ----------

export const LOADS = {
  // How many times in a row this project started loading and never finished.
  async failures(id) {
    const rec = await STORAGE.get('meta', 'loading').catch(() => null);
    return rec && rec.id === id ? rec.count || 0 : 0;
  },
  async begin(id) {
    const count = await LOADS.failures(id);
    await STORAGE.put('meta', { id, count: count + 1, at: Date.now() }, 'loading').catch(() => {});
  },
  async ok() { await STORAGE.del('meta', 'loading').catch(() => {}); }
};

// Delete a project, its undo history, its filmstrips and the files no other project uses.
export async function deleteProject(id) {
  const p = await PROJECTS.get(id).catch(() => null);
  await PROJECTS.remove(id);
  if (p) {
    const keep = await pathsInUse();
    for (const path of PROJECTS.paths(p)) if (!keep.has(path)) await OPFS.remove(path).catch(() => {});
    for (const [assetId, a] of Object.entries(p.assets || {})) if (!keep.has(a.path)) await THUMBS.remove(assetId).catch(() => {});
  }
  if ((await STORAGE.get('meta', 'lastProject').catch(() => null)) === id) await STORAGE.del('meta', 'lastProject').catch(() => {});
  await LOADS.ok();
  DEBUG.log('info', 'Deleted a project', 'safety');
}

// ---------- Files out: Backup and project data ----------

async function giveFile(ui, file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return true; }
    catch (err) { if (err.name === 'AbortError') return false; DEBUG.log('warn', `Share: ${err.name}`, 'safety'); }
  }
  // Fallback: a download link (Safari asks to save it to Files).
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}

export async function backupNow(ui) {
  await SAVE.flush();
  const data = await BACKUP.make();
  const file = new File([JSON.stringify(data, null, 1)], `cakewalk-backup-${stamp()}.json`, { type: 'application/json' });
  DEBUG.log('info', `Backup made: ${data.projects.length} projects, ${bytes(file.size)}`, 'safety');
  if (await giveFile(ui, file)) ui.toast('Backup ready. Save it to Files.', { sparkle: true });
}

// Returns true if something was restored (the app then reloads Settings).
export async function restoreBackup(ui) {
  const files = await pick({ accept: '.json,application/json' });
  if (!files.length) return false;
  let data;
  try { data = JSON.parse(await files[0].text()); }
  catch { ui.toast('That file isn\'t a Cake Walk backup.'); return false; }
  if (data?.kind !== BACKUP.KIND) { ui.toast('That file isn\'t a Cake Walk backup.'); return false; }
  const n = (data.projects || []).length;
  const when = data.at ? new Date(data.at).toLocaleDateString() : 'an earlier day';
  const yes = await ui.sheet({
    title: `Restore ${n} project${n === 1 ? '' : 's'}?`,
    text: `From ${when}. Your projects here stay as they are; a copy with the same project gets "(restored)" on its name. Backups hold your edits, not your clips, so each project asks you to pick its clips again when you open it.`,
    actions: [{ label: 'Not now', value: false }, { label: 'Restore', value: true, main: true }]
  });
  if (!yes) return false;
  try {
    const res = await BACKUP.restore(data);
    DEBUG.log('info', `Backup restored: ${res.projects} projects, ${res.renamed} renamed`, 'safety');
    ui.toast(`Restored ${res.projects} project${res.projects === 1 ? '' : 's'}. Open each one to pick its clips.`, { sparkle: true, ms: 3200 });
    return true;
  } catch (err) {
    DEBUG.log('error', `Restore: ${err.message}`, 'safety');
    ui.toast(err.message.includes('backup') ? err.message : 'Restore hit a snag. Debug has the details.');
    return false;
  }
}

// ---------- Recovery screen ----------

export async function renderRecovery(main, ui, params = {}) {
  const view = clone('tpl-recovery');
  main.appendChild(view);
  const id = params.id;
  let project = null;
  try { project = await PROJECTS.get(id); } catch (err) { DEBUG.log('error', `Recovery read: ${err.message}`, 'safety'); }
  const fails = await LOADS.failures(id);
  $('[data-slot="name"]', view).textContent = project?.name || 'This project';
  $('[data-slot="text"]', view).textContent = `It didn't open ${fails >= 2 ? 'twice in a row' : 'last time'}, so Cake Walk stopped trying instead of crashing. Your clips are still safe inside Cake Walk.`;
  view.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rec]');
    if (!b) return;
    e.stopPropagation();
    const act = b.dataset.rec;
    if (act === 'safe') { await LOADS.ok(); ui.go('editor', { id, safe: true }); }
    else if (act === 'data') {
      if (!project) { ui.toast('This project\'s data can\'t be read.'); return; }
      const file = new File([JSON.stringify({ kind: 'cakewalk-project', appVersion: CONFIG.APP_VERSION, at: new Date().toISOString(), project }, null, 1)],
        `cakewalk-project-${safeName(project.name)}-${stamp()}.json`, { type: 'application/json' });
      await giveFile(ui, file);
    } else if (act === 'delete') {
      const yes = await ui.sheet({ title: 'Delete this project?', text: 'Its edit and the clips only it uses are deleted. This can\'t be undone.', actions: [{ label: 'Keep it', value: false }, { label: 'Delete', value: true, main: true }] });
      if (!yes) return;
      await deleteProject(id);
      ui.toast('Deleted. Fresh start.');
      ui.go('home');
    } else if (act === 'home') { ui.go('home'); }
  });
}

// ---------- Storage screen ----------

export async function renderStorage(main, ui) {
  const view = clone('tpl-storage');
  main.appendChild(view);
  await SAVE.flush();
  const [est, files, projects, shared, running] = await Promise.all([
    STORAGE.estimate(),
    OPFS.list().catch(() => []),
    PROJECTS.list().catch(() => []),
    STORAGE.get('meta', 'exportsShared').catch(() => null),
    STORAGE.get('meta', 'exportRunning').catch(() => null)
  ]);
  const sizeOf = new Map(files.map((f) => [f.path, f.size]));
  const sharedSet = new Set(shared || []);
  const busy = new Set(running?.paths || []);
  const rerender = () => { main.innerHTML = ''; renderStorage(main, ui); };

  // Totals
  $('[data-slot="used"]', view).textContent = est ? bytes(est.usage) : 'Unknown';
  $('[data-slot="free"]', view).textContent = est ? `about ${bytes(Math.max(0, est.quota - est.usage))}` : 'Unknown';

  // Projects, biggest first, with a nudge for ones not opened in 30 days
  const pBox = $('[data-slot="projects"]', view);
  const used = new Set(projects.flatMap((p) => PROJECTS.paths(p)));
  const rows = projects.map((p) => ({ p, size: PROJECTS.paths(p).reduce((a, path) => a + (sizeOf.get(path) || 0), 0) })).sort((a, b) => b.size - a.size);
  if (!rows.length) pBox.appendChild(el('p', 'muted small', 'No projects yet.'));
  for (const { p, size } of rows) {
    const old = Date.now() - (p.openedAt || p.updatedAt || 0) > OLD_PROJECT_DAYS * DAY;
    const days = Math.floor((Date.now() - (p.openedAt || p.updatedAt || Date.now())) / DAY);
    const row = el('div', 'store-row');
    const grow = el('div', 'grow');
    grow.append(el('b', null, p.name), el('div', 'muted small', `${bytes(size)} · opened ${days < 1 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`}`));
    if (old) grow.appendChild(el('div', 'store-tip small', `Not opened in ${OLD_PROJECT_DAYS}+ days. Delete it to free ${bytes(size)}?`));
    const del = el('button', 'btn btn-sm btn-ghost', 'Delete');
    del.addEventListener('click', async () => {
      const yes = await ui.sheet({ title: `Delete ${p.name}?`, text: 'Its edit and the clips only it uses are deleted. Exports you already saved stay in your Photos or Files.', actions: [{ label: 'Keep it', value: false }, { label: 'Delete', value: true, main: true }] });
      if (!yes) return;
      await deleteProject(p.id);
      ui.toast(`Freed ${bytes(size)}.`, { sparkle: true });
      rerender();
    });
    row.append(grow, del);
    pBox.appendChild(row);
  }

  // Old exports in Cake Walk (the copies you shared or saved live on in Photos or Files)
  const eBox = $('[data-slot="exports"]', view);
  const exportsList = files.filter((f) => f.path.startsWith('exports/') && !busy.has(f.path));
  const doneOnes = exportsList.filter((f) => sharedSet.has(f.path.slice(8)));
  if (!exportsList.length) eBox.appendChild(el('p', 'muted small', 'No exports stored here.'));
  for (const f of exportsList) {
    const row = el('div', 'store-row');
    const grow = el('div', 'grow');
    const isShared = sharedSet.has(f.path.slice(8));
    grow.append(el('b', 'wrap', f.path.slice(8)), el('div', 'muted small', `${bytes(f.size)}${isShared ? ' · already shared or saved, safe to delete' : ''}`));
    const del = el('button', 'btn btn-sm btn-ghost', 'Delete');
    del.addEventListener('click', async () => { await OPFS.remove(f.path).catch(() => {}); ui.toast(`Freed ${bytes(f.size)}.`); rerender(); });
    row.append(grow, del);
    eBox.appendChild(row);
  }
  if (doneOnes.length) {
    const all = el('button', 'btn btn-main', `Delete shared exports (${bytes(doneOnes.reduce((a, f) => a + f.size, 0))})`);
    all.addEventListener('click', async () => {
      for (const f of doneOnes) await OPFS.remove(f.path).catch(() => {});
      ui.toast('Cleaned up. Your shared copies are safe in Photos or Files.', { sparkle: true });
      rerender();
    });
    eBox.appendChild(all);
  }

  // Unused clips and songs: in Cake Walk's storage but in no project
  const uBox = $('[data-slot="unused"]', view);
  const unused = files.filter((f) => !f.path.startsWith('exports/') && !used.has(f.path) && !busy.has(f.path));
  const unusedSize = unused.reduce((a, f) => a + f.size, 0);
  uBox.appendChild(el('p', 'muted small', unused.length
    ? `${unused.length} file${unused.length === 1 ? '' : 's'} no project uses, ${bytes(unusedSize)}. Leftovers from deleted clips or stopped imports.`
    : 'None. Every file belongs to a project.'));
  if (unused.length) {
    const all = el('button', 'btn btn-main', `Delete unused (${bytes(unusedSize)})`);
    all.addEventListener('click', async () => {
      // Check again right before deleting, in case a project changed.
      const inUse = await pathsInUse();
      for (const f of unused) if (!inUse.has(f.path)) await OPFS.remove(f.path).catch(() => {});
      DEBUG.log('info', `Storage: deleted ${unused.length} unused files`, 'safety');
      ui.toast(`Freed ${bytes(unusedSize)}.`, { sparkle: true });
      rerender();
    });
    uBox.appendChild(all);
  }
}

