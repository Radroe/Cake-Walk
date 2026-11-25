// Cake Walk: the Web Worker (module worker)
// Decodes, draws, encodes and analyzes video (Prompts 2 onward), and owns all OPFS work.
// Every message: { id, type, payload }. Every reply: { id, ok, result } or { id, ok: false, error }.

import { CONFIG } from './config.js';
import { colorFor, drawBase, transitionAt, composite, drawOverlays } from './look.js';
import { lumaOf, frameDiff, detectCuts, OnsetMeter, detectBeats } from './rhythm.js';
import { relabelAvcC } from './avc.js';

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

// ---------- Clips: read the details and the filmstrip (Prompt 2) ----------

async function readFile(path) {
  closeHandle(path);
  const fh = await getFileHandle(path, false);
  return fh.getFile();
}

async function openInput(path) {
  const mb = await loadMediabunny();
  const file = await readFile(path);
  return { mb, file, input: new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS }) };
}

async function jpeg(canvas) {
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
}

handlers['clip.probe'] = async ({ path, type, photoSeconds = 3 }) => {
  if (String(type).startsWith('image/')) {
    const file = await readFile(path);
    const bmp = await createImageBitmap(file);
    const out = { kind: 'photo', width: bmp.width, height: bmp.height, duration: photoSeconds, size: file.size, codec: type, fps: null, hdr: null, hasAudio: false };
    bmp.close();
    return out;
  }
  const { input, file } = await openInput(path);
  try {
    const format = await input.getFormat().catch(() => null);
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    const duration = await input.computeDuration();
    if (!video) {
      if (!audio) throw new Error('No video or sound found in this file');
      return {
        kind: 'audio', duration, size: file.size, format: format?.name || null,
        codec: audio.codec, sampleRate: audio.sampleRate, channels: audio.numberOfChannels,
        canDecode: await audio.canDecode()
      };
    }
    let fps = null;
    try { fps = (await video.computeFrameRateMetrics()).bestGuessFrameRate; } catch {}
    let transfer = null;
    try { transfer = (await video.getColorSpace())?.transfer || null; } catch {}
    const hdr = await video.hasHighDynamicRange().catch(() => false);
    return {
      kind: 'video',
      format: format?.name || null,
      duration,
      size: file.size,
      width: video.displayWidth,
      height: video.displayHeight,
      rotation: video.rotation,
      fps: fps ? Math.round(fps * 100) / 100 : null,
      codec: video.codec,
      codecString: await video.getCodecParameterString().catch(() => null),
      hdr: hdr ? (transfer === 'pq' ? 'PQ' : transfer === 'hlg' ? 'HLG' : 'HDR') : null,
      canDecode: await video.canDecode(),
      hasAudio: !!audio,
      audioCodec: audio?.codec || null,
      audioCanDecode: audio ? await audio.canDecode() : false
    };
  } finally {
    input.dispose();
  }
};

handlers['clip.thumbs'] = async ({ path, kind, duration, width = 96, every = 2, max = 40 }) => {
  if (kind === 'photo') {
    const bmp = await createImageBitmap(await readFile(path));
    const h = Math.round(width * bmp.height / bmp.width) || width;
    const c = new OffscreenCanvas(width, h);
    c.getContext('2d').drawImage(bmp, 0, 0, width, h);
    bmp.close();
    return [await jpeg(c)];
  }
  const { mb, input } = await openInput(path);
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video || !(await video.canDecode())) return [];
    const start = await video.getFirstTimestamp().catch(() => 0);
    const count = Math.max(1, Math.min(max, Math.ceil(duration / every)));
    const times = Array.from({ length: count }, (_, i) => start + (duration * (i + 0.5)) / count);
    const sink = new mb.CanvasSink(video, { width, poolSize: 0 });
    const out = [];
    for await (const wrapped of sink.canvasesAtTimestamps(times)) {
      if (wrapped) out.push(await jpeg(wrapped.canvas));
    }
    return out;
  } finally {
    input.dispose();
  }
};

// ---------- Export (Prompt 3) ----------
// One frame at a time: decode, draw on an OffscreenCanvas, encode, write straight into OPFS.
// Nothing holds the whole video in memory. Audio is mixed one second at a time, interleaved with video.

const cancelled = new Set();
const RATE = 48000;

handlers['export.cancel'] = async ({ job }) => { cancelled.add(job); return true; };


// Mix one source's sound into out[L,R] for timeline range [a, b).
async function mixSource(src, a, b, out, frames) {
  // src: { sink, tlStart, srcStart, srcEnd, gain(tl) }
  const tlEnd = src.tlStart + (src.srcEnd - src.srcStart);
  const from = Math.max(a, src.tlStart), to = Math.min(b, tlEnd);
  if (to <= from) return;
  const sFrom = src.srcStart + (from - src.tlStart), sTo = src.srcStart + (to - src.tlStart);
  for await (const sample of src.sink.samples(Math.max(0, sFrom - 0.05), sTo + 0.05)) {
    try {
      const sr = sample.sampleRate, n = sample.numberOfFrames, ch = sample.numberOfChannels;
      const planes = [];
      for (let c = 0; c < Math.min(2, ch); c++) {
        const buf = new Float32Array(n);
        sample.copyTo(buf, { planeIndex: c, format: 'f32-planar' });
        planes.push(buf);
      }
      if (planes.length === 1) planes.push(planes[0]);
      const sampleTl = src.tlStart + (sample.timestamp - src.srcStart);
      const k0 = Math.max(0, Math.ceil((Math.max(sampleTl, from) - a) * RATE));
      const k1 = Math.min(frames, Math.floor((Math.min(sampleTl + n / sr, to) - a) * RATE));
      for (let k = k0; k < k1; k++) {
        const tl = a + k / RATE;
        const pos = (tl - sampleTl) * sr;
        const i0 = Math.floor(pos), f = pos - i0;
        if (i0 < 0 || i0 >= n) continue;
        const i1 = Math.min(n - 1, i0 + 1);
        const g = src.gain(tl);
        out[0][k] += (planes[0][i0] * (1 - f) + planes[0][i1] * f) * g;
        out[1][k] += (planes[1][i0] * (1 - f) + planes[1][i1] * f) * g;
      }
    } finally {
      sample.close();
    }
  }
}

handlers['export.run'] = async (p) => {
  try {
    return await runExport(p, p.codecString);
  } catch (err) {
    // If this iPhone refuses the exact H.264 level string, let Mediabunny pick one and try once more.
    if (p.codecString && err?.name !== 'AbortError' && err?.name !== 'QuotaExceededError' && /config|codec|support/i.test(err?.message || '')) {
      self.postMessage({ type: 'export-note', job: p.job, message: `Retrying without ${p.codecString}: ${err.message}` });
      return runExport(p, null);
    }
    throw err;
  }
};

async function runExport({ job, clips, music, look = {}, width: W, height: H, fps, bitrate, audioBitrate = 256000, outPath, keyFrameInterval = 0.5 }, codecString) {
  const mb = await loadMediabunny();
  cancelled.delete(job);
  const segs = [];
  let tl = 0;
  for (const c of clips) {
    const len = (c.out - c.in) / c.speed;
    segs.push({ ...c, tlStart: tl, tlEnd: tl + len });
    tl += len;
  }
  const total = tl;
  if (!(total > 0)) throw new Error('The timeline is empty');
  const frameCount = Math.max(1, Math.round(total * fps));

  // Open every source once.
  const inputs = [];
  for (const s of segs) {
    if (s.kind === 'photo') {
      s.bitmap = await createImageBitmap(await readFile(s.path));
      continue;
    }
    const { input } = await openInput(s.path);
    inputs.push(input);
    const v = await input.getPrimaryVideoTrack();
    s.videoSink = new mb.VideoSampleSink(v);
    const a = await input.getPrimaryAudioTrack();
    if (a && !s.muted && s.speed === 1 && s.volume > 0 && (await a.canDecode())) s.audioSink = new mb.AudioSampleSink(a);
  }
  const audioSources = segs.filter((s) => s.audioSink).map((s) => ({
    sink: s.audioSink, tlStart: s.tlStart, srcStart: s.in, srcEnd: s.out, gain: () => s.volume
  }));
  if (music) {
    const { input } = await openInput(music.path);
    inputs.push(input);
    const a = await input.getPrimaryAudioTrack();
    if (a && (await a.canDecode())) {
      // offset: where this file starts on the full timeline (Story parts). Fades follow the full timeline.
      const offset = music.offset || 0;
      const fullEnd = Math.min(music.fullLength || total, music.duration || Infinity);
      const first = await a.getFirstTimestamp().catch(() => 0);
      const fi = music.fadeIn || 0, fo = music.fadeOut || 0;
      if (fullEnd > offset) {
        audioSources.push({
          sink: new mb.AudioSampleSink(a), tlStart: 0, srcStart: first + offset, srcEnd: first + Math.min(fullEnd, offset + total),
          gain: (t) => {
            const T = t + offset;
            let g = music.volume ?? 1;
            if (fi > 0 && T < fi) g *= T / fi;
            if (fo > 0 && T > fullEnd - fo) g *= Math.max(0, (fullEnd - T) / fo);
            return g;
          }
        });
      }
    }
  }

  // Output file in OPFS, written through a sync access handle.
  closeHandle(outPath);
  const ah = await getAccessHandle(outPath);
  ah.truncate(0);
  const target = new mb.StreamTarget(new WritableStream({
    write(chunk) {
      const view = chunk.data;
      let done = 0;
      while (done < view.byteLength) {
        const n = ah.write(view.subarray(done), { at: chunk.position + done });
        if (!n) throw new Error('Nothing was written');
        done += n;
      }
    }
  }));
  // fastStart 'reserve' needs maximumPacketCount on every track. // VERIFY on iOS 26.
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'reserve' }), target });
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d', { alpha: false });
  // The look (Prompt 6), drawn with look.js exactly like the preview: each clip's picture layer goes on `base`,
  // the last picture of the clip before is kept on `held` for transitions, then text and stickers go on top.
  // offset: where this file starts on the full timeline (Story parts), so text and transitions keep their times.
  const base = new OffscreenCanvas(W, H);
  const bctx = base.getContext('2d', { alpha: false });
  const held = new OffscreenCanvas(W, H);
  const hctx = held.getContext('2d', { alpha: false });
  let heldFor = -1;
  const offset = look.offset || 0;
  const videoConfig = { codec: 'avc', bitrate, bitrateMode: 'variable', keyFrameInterval };
  if (codecString) videoConfig.fullCodecString = codecString;
  // Label the file BT.709, the SDR standard TikTok, Instagram and YouTube expect. The frames come from an sRGB canvas,
  // so some encoders write the sRGB transfer label instead; the picture is the same SDR picture either way.
  // Mediabunny writes the file's color box from this same object right after this hook. // VERIFY on iOS 26.
  // The stream's own settings (SPS) can carry the sRGB label too; relabelAvcC fixes just that byte, or leaves it.
  videoConfig.onEncodedPacket = (packet, meta) => {
    const dc = meta?.decoderConfig;
    if (!dc) return;
    dc.colorSpace = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: !!dc.colorSpace?.fullRange };
    if (dc.description) {
      const fixed = relabelAvcC(dc.description);
      if (fixed) dc.description = fixed;
    }
  };
  const videoSource = new mb.CanvasSource(canvas, videoConfig);
  output.addVideoTrack(videoSource, { frameRate: fps, maximumPacketCount: Math.ceil(frameCount * 1.1) + 60 });
  // AAC-LC 48 kHz stereo. If this browser can't encode AAC (only seen outside iOS), export picture only and say so.
  const canAac = await mb.canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: RATE, bitrate: audioBitrate }).catch(() => false);
  const audioSource = canAac ? new mb.AudioSampleSource({ codec: 'aac', bitrate: audioBitrate }) : null;
  if (audioSource) output.addAudioTrack(audioSource, { maximumPacketCount: Math.ceil((total * RATE) / 1024 * 1.33) + 200 });

  const cleanup = async (removeFile) => {
    inputs.forEach((i) => { try { i.dispose(); } catch {} });
    segs.forEach((s) => s.bitmap?.close());
    closeHandle(outPath);
    if (removeFile) {
      try { const { dirs, name } = splitPath(outPath); await (await getDir(dirs, false)).removeEntry(name); } catch {}
    }
  };

  try {
    await output.start();
    let audioDone = 0;
    const pushAudioUntil = async (until) => {
      if (!audioSource) { audioDone = until; return; }
      while (audioDone < until - 1e-9) {
        const a = audioDone, b = Math.min(until, audioDone + 1);
        const frames = Math.round((b - a) * RATE);
        if (frames <= 0) { audioDone = b; break; }
        const out = [new Float32Array(frames), new Float32Array(frames)];
        for (const src of audioSources) await mixSource(src, a, b, out, frames);
        const planar = new Float32Array(frames * 2);
        for (let k = 0; k < frames; k++) {
          planar[k] = Math.max(-1, Math.min(1, out[0][k]));
          planar[frames + k] = Math.max(-1, Math.min(1, out[1][k]));
        }
        const sample = new mb.AudioSample({ data: planar, format: 'f32-planar', numberOfChannels: 2, sampleRate: RATE, timestamp: a });
        await audioSource.add(sample);
        sample.close();
        audioDone = b;
      }
    };

    let frame = 0;
    for (const [si, s] of segs.entries()) {
      const color = colorFor(s.color, look.grade, look.lane);
      const first = Math.ceil(s.tlStart * fps - 1e-6);
      const last = Math.min(frameCount, Math.ceil(s.tlEnd * fps - 1e-6));
      if (last <= first) continue;
      const times = [];
      for (let i = first; i < last; i++) times.push(s.in + (i / fps - s.tlStart) * s.speed);
      const iter = s.videoSink ? s.videoSink.samplesAtTimestamps(times)[Symbol.asyncIterator]() : null;
      for (let i = first; i < last; i++) {
        if (cancelled.has(job)) throw new DOMException('Export cancelled', 'AbortError');
        const t = i / fps;
        const T = t + offset;
        if (s.bitmap) {
          drawBase(bctx, W, H, { draw: (c, dx, dy, dw, dh) => c.drawImage(s.bitmap, dx, dy, dw, dh), sw: s.bitmap.width, sh: s.bitmap.height, frame: s.frame, color });
        } else {
          const sample = iter ? (await iter.next()).value : null;
          try {
            // VideoSample.draw applies the clip's rotation; displayWidth/Height are its upright size. // VERIFY on iOS 26.
            drawBase(bctx, W, H, {
              draw: sample ? (c, dx, dy, dw, dh) => sample.draw(c, dx, dy, dw, dh) : null,
              sw: sample?.displayWidth, sh: sample?.displayHeight, frame: s.frame, color
            });
          } finally { sample?.close(); }
        }
        const tr = transitionAt(s, s.fullStart ?? s.tlStart + offset, s.fullLen ?? s.tlEnd - s.tlStart, T, look.lane);
        composite(ctx, W, H, base, tr && heldFor === si ? held : null, tr);
        drawOverlays(ctx, W, H, { texts: look.texts, stickers: look.stickers, T, lane: look.lane });
        if (i === last - 1) { hctx.drawImage(base, 0, 0); heldFor = si + 1; }
        if (t >= audioDone) await pushAudioUntil(Math.min(total, audioDone + 1));
        await videoSource.add(t, 1 / fps);
        frame = i + 1;
        if (frame % 10 === 0) self.postMessage({ type: 'export-progress', job, fraction: frame / frameCount });
      }
      if (iter?.return) await iter.return();
    }
    await pushAudioUntil(total);
    await output.finalize();
    const size = ah.getSize();
    await cleanup(false);
    self.postMessage({ type: 'export-progress', job, fraction: 1 });
    return { path: outPath, size, duration: total, frames: frameCount, audio: !!audioSource };
  } catch (err) {
    try { await output.cancel(); } catch {}
    await cleanup(true);
    throw err;
  } finally {
    cancelled.delete(job);
  }
}

// ---------- SPEC CHECK (Prompt 4): read a finished export back and report what's really in it ----------

// Walk the top-level MP4 boxes: fast start means the index (moov) comes before the media (mdat).
async function topBoxes(file) {
  const boxes = [];
  let pos = 0;
  while (pos + 8 <= file.size && boxes.length < 64) {
    const head = new DataView(await file.slice(pos, pos + 16).arrayBuffer());
    let size = head.getUint32(0);
    const type = String.fromCharCode(head.getUint8(4), head.getUint8(5), head.getUint8(6), head.getUint8(7));
    if (size === 1) size = Number(head.getBigUint64(8));
    else if (size === 0) size = file.size - pos;
    if (size < 8) break;
    boxes.push({ type, pos, size });
    pos += size;
  }
  return boxes;
}

handlers['export.check'] = async ({ path }) => {
  const { mb, input, file } = await openInput(path);
  try {
    const boxes = await topBoxes(file);
    const moov = boxes.find((b) => b.type === 'moov'), mdat = boxes.find((b) => b.type === 'mdat');
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    const duration = await input.computeDuration();
    const facts = { size: file.size, duration, fastStart: !!(moov && mdat && moov.pos < mdat.pos), boxes: boxes.map((b) => b.type).join(','), video: null, audio: null, maxKeyGap: null };
    if (video) {
      let fps = null;
      try { fps = (await video.computeFrameRateMetrics()).bestGuessFrameRate; } catch {}
      let colorSpace = null;
      try { colorSpace = await video.getColorSpace(); } catch {}
      facts.video = {
        width: video.displayWidth, height: video.displayHeight, codec: video.codec, fps,
        codecString: await video.getCodecParameterString().catch(() => null), colorSpace
      };
      // Keyframe spacing, read from packet headers only (no picture data).
      try {
        const sink = new mb.EncodedPacketSink(video);
        let pkt = await sink.getFirstKeyPacket({ metadataOnly: true });
        let prev = null, gap = 0, n = 0;
        while (pkt && n < 100000) {
          if (prev !== null) gap = Math.max(gap, pkt.timestamp - prev);
          prev = pkt.timestamp;
          n++;
          pkt = await sink.getNextKeyPacket(pkt, { metadataOnly: true });
        }
        if (prev !== null) gap = Math.max(gap, duration - prev);
        facts.maxKeyGap = gap;
        facts.keyframes = n;
      } catch {}
    }
    if (audio) {
      facts.audio = { codec: audio.codec, sampleRate: audio.sampleRate, channels: audio.numberOfChannels, codecString: await audio.getCodecParameterString().catch(() => null) };
    }
    return facts;
  } finally {
    input.dispose();
  }
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

// ---------- Remix: read the timing of a video you like (Prompt 7) ----------
// Cuts: small frames (about 160 px wide), with the app's buttons and captions cropped out first, compared one
// after another. Beats: the sound is decoded with WebCodecs (AudioDecoder, through Mediabunny's AudioSampleSink)
// and reduced to a loudness curve of 100 numbers a second, so a long song never sits in memory.
// Only timing comes out of here. No picture or sound from the reference is ever copied into your video.

const remixCancelled = new Set();
handlers['remix.cancel'] = async ({ job }) => { remixCancelled.add(job); return true; };

function remixProgress(job, stage, value) {
  self.postMessage({ type: 'remix-progress', job, stage, value: Math.max(0, Math.min(1, value)) });
}

async function readBeats(mb, input, job, from, to, onPart) {
  const audio = await input.getPrimaryAudioTrack();
  if (!audio || !(await audio.canDecode())) return { beats: [], bpm: null, noAudio: true };
  const sink = new mb.AudioSampleSink(audio);
  let meter = null;
  const span = Math.max(0.1, to - from);
  for await (const sample of sink.samples(from, to)) {
    try {
      if (remixCancelled.has(job)) throw new DOMException('Cancelled', 'AbortError');
      meter ||= new OnsetMeter(sample.sampleRate);
      const n = sample.numberOfFrames, ch = Math.min(2, sample.numberOfChannels);
      const mono = new Float32Array(n);
      const buf = new Float32Array(n);
      for (let c = 0; c < ch; c++) {
        sample.copyTo(buf, { planeIndex: c, format: 'f32-planar' });
        for (let i = 0; i < n; i++) mono[i] += buf[i] / ch;
      }
      meter.push(mono);
      onPart(Math.min(1, (sample.timestamp - from) / span));
    } finally {
      sample.close();
    }
  }
  if (!meter) return { beats: [], bpm: null, noAudio: true };
  const found = detectBeats(meter.envelope(), { duration: span });
  return { beats: found.beats.map((b) => +(b + from).toFixed(3)), bpm: found.bpm };
}

// crop: the part of the frame to watch, as fractions { x0, y0, x1, y1 }. beatsPath: a different file to take
// beats from (your own song); leave it out to use the reference's sound. cuts: false skips cut finding.
handlers['remix.analyze'] = async ({ job, path, crop, cuts: findCuts = true, beats: findBeats = true, beatsPath = null, fps = 15, width = 160 }) => {
  remixCancelled.delete(job);
  const { mb, input } = await openInput(path);
  const out = { duration: 0, cuts: [], beats: [], bpm: null, noAudio: false, frames: 0 };
  try {
    const duration = await input.computeDuration();
    out.duration = +duration.toFixed(3);
    const video = await input.getPrimaryVideoTrack();
    if (findCuts && video && (await video.canDecode())) {
      const start = await video.getFirstTimestamp().catch(() => 0);
      const step = 1 / fps;
      const times = [];
      for (let t = start; t < start + duration - step / 2; t += step) times.push(t);
      const c = crop || { x0: 0, y0: 0, x1: 1, y1: 1 };
      const sink = new mb.CanvasSink(video, { width: width * 2, poolSize: 1 });
      const small = new OffscreenCanvas(width, Math.max(16, Math.round(width * 16 / 9)));
      const sctx = small.getContext('2d', { willReadFrequently: true });
      const lumaOfFrame = (src) => {
        const sx = src.width * c.x0, sy = src.height * c.y0;
        const sw = Math.max(4, src.width * (c.x1 - c.x0)), sh = Math.max(4, src.height * (c.y1 - c.y0));
        const h = Math.max(16, Math.round(width * sh / sw));
        if (small.height !== h) small.height = h;
        sctx.drawImage(src, sx, sy, sw, sh, 0, 0, width, h);
        return lumaOf(sctx.getImageData(0, 0, width, h).data);
      };
      const scores = [], when = [];
      let prev = null, i = 0;
      for await (const wrapped of sink.canvasesAtTimestamps(times)) {
        if (remixCancelled.has(job)) throw new DOMException('Cancelled', 'AbortError');
        const t = times[i++];
        if (!wrapped) continue;
        const cur = lumaOfFrame(wrapped.canvas);
        scores.push(prev ? frameDiff(prev, cur) : 0);
        when.push(+(t - start).toFixed(3));
        prev = cur;
        if (i % 15 === 0) remixProgress(job, 'cuts', (i / times.length) * (findBeats ? 0.65 : 0.9));
      }
      out.frames = scores.length;
      const rough = detectCuts(scores, when);
      // Sharpen each cut: look at four more frames between the two samples and take the first one that
      // already looks like the new shot. That puts the cut within about one video frame of the real one.
      const sharp = [];
      for (const cut of rough) {
        if (remixCancelled.has(job)) throw new DOMException('Cancelled', 'AbortError');
        const k = when.indexOf(cut);
        const a = k > 0 ? when[k - 1] : cut - step;
        const sub = [a, a + step * 0.2, a + step * 0.4, a + step * 0.6, a + step * 0.8, cut].map((v) => start + v);
        const lumas = [];
        for await (const wrapped of sink.canvasesAtTimestamps(sub)) lumas.push(wrapped ? lumaOfFrame(wrapped.canvas) : null);
        const before = lumas[0], after = lumas[lumas.length - 1];
        let at = cut;
        if (before && after) {
          for (let j = 1; j < lumas.length; j++) {
            if (lumas[j] && frameDiff(lumas[j], after) < frameDiff(lumas[j], before)) { at = +(sub[j] - start).toFixed(3); break; }
          }
        }
        sharp.push(at);
      }
      out.cuts = sharp;
      remixProgress(job, 'cuts', findBeats ? 0.7 : 1);
    }
    if (findBeats) {
      let res;
      if (beatsPath && beatsPath !== path) {
        const other = await openInput(beatsPath);
        try {
          const d = await other.input.computeDuration();
          res = await readBeats(other.mb, other.input, job, 0, Math.min(d, duration), (f) => remixProgress(job, 'beats', 0.7 + f * 0.3));
        } finally { other.input.dispose(); }
      } else {
        res = await readBeats(mb, input, job, 0, duration, (f) => remixProgress(job, 'beats', (findCuts ? 0.7 : 0) + f * (findCuts ? 0.3 : 1)));
      }
      Object.assign(out, res);
    }
    remixProgress(job, 'done', 1);
    return out;
  } finally {
    remixCancelled.delete(job);
    input.dispose();
  }
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
