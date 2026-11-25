// Cake Walk: AVC color label (Prompt 7 fix). Some H.264 encoders label frames drawn from a canvas with the sRGB
// transfer (13) inside the video stream. TikTok, Instagram and YouTube expect BT.709 (1) for SDR. The picture is
// the same either way; this only corrects the label in the stream's settings (the SPS inside avcC).
// If anything about the stream isn't what we expect, it returns null and the file keeps its original label.

// Reads bits from RBSP bytes (emulation prevention already removed).
class Bits {
  constructor(bytes) { this.b = bytes; this.p = 0; }
  u(n) {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.b[this.p >> 3];
      if (byte === undefined) throw new Error('short');
      v = v * 2 + ((byte >> (7 - (this.p & 7))) & 1);
      this.p++;
    }
    return v;
  }
  ue() {
    let zeros = 0;
    while (this.u(1) === 0) { if (++zeros > 31) throw new Error('bad ue'); }
    return zeros ? 2 ** zeros - 1 + this.u(zeros) : 0;
  }
  se() { const k = this.ue(); return k & 1 ? (k + 1) / 2 : -k / 2; }
}

function unescape(nal) {
  const out = [];
  let zeros = 0;
  for (const v of nal) {
    if (zeros >= 2 && v === 3) { zeros = 0; continue; }   // an emulation prevention byte
    out.push(v);
    zeros = v === 0 ? zeros + 1 : 0;
  }
  return Uint8Array.from(out);
}

function escape(rbsp) {
  const out = [];
  let zeros = 0;
  for (const v of rbsp) {
    if (zeros >= 2 && v <= 3) { out.push(3); zeros = 0; }
    out.push(v);
    zeros = v === 0 ? zeros + 1 : 0;
  }
  return Uint8Array.from(out);
}

// Bit position of transfer_characteristics in an SPS (RBSP, NAL header included), or -1.
function transferBit(rbsp) {
  const r = new Bits(rbsp);
  r.u(8);                                   // NAL header
  const profile = r.u(8); r.u(8); r.u(8);   // profile, constraint flags, level
  r.ue();                                   // seq_parameter_set_id
  if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(profile)) {
    if (r.ue() === 3) r.u(1);               // chroma_format_idc, separate_colour_plane_flag
    r.ue(); r.ue(); r.u(1);                 // bit depths, qpprime
    if (r.u(1)) return -1;                  // scaling matrices: rare from these encoders, so leave the file alone
  }
  r.ue();                                   // log2_max_frame_num
  const poc = r.ue();
  if (poc === 0) r.ue();
  else if (poc === 1) { r.u(1); r.se(); r.se(); const n = r.ue(); for (let i = 0; i < n; i++) r.se(); }
  r.ue(); r.u(1);                           // max_num_ref_frames, gaps
  r.ue(); r.ue();                           // width, height in macroblocks
  if (!r.u(1)) r.u(1);                      // frame_mbs_only, mb_adaptive
  r.u(1);                                   // direct_8x8
  if (r.u(1)) { r.ue(); r.ue(); r.ue(); r.ue(); }   // cropping
  if (!r.u(1)) return -1;                   // no VUI: no label to fix
  if (r.u(1)) { if (r.u(8) === 255) { r.u(16); r.u(16); } }   // aspect ratio
  if (r.u(1)) r.u(1);                       // overscan
  if (!r.u(1)) return -1;                   // video_signal_type_present
  r.u(3); r.u(1);                           // video_format, full range
  if (!r.u(1)) return -1;                   // colour_description_present
  r.u(8);                                   // colour_primaries
  return r.p;
}

// avcC bytes in, fixed avcC bytes out (or null when nothing needed changing or it wasn't safe to).
export function relabelAvcC(avcc) {
  try {
    const a = avcc instanceof Uint8Array ? avcc : new Uint8Array(avcc.buffer ? avcc.buffer.slice(avcc.byteOffset, avcc.byteOffset + avcc.byteLength) : avcc);
    if (a[0] !== 1 || a.length < 8) return null;
    const numSps = a[5] & 31;
    let p = 6;
    const parts = [a.subarray(0, 6)];
    let changed = false;
    for (let s = 0; s < numSps; s++) {
      const len = (a[p] << 8) | a[p + 1];
      const nal = a.subarray(p + 2, p + 2 + len);
      if (nal.length !== len) return null;
      p += 2 + len;
      const rbsp = unescape(nal);
      const at = transferBit(rbsp);
      let out = nal;
      if (at >= 0 && at % 1 === 0) {
        const r = new Bits(rbsp); r.p = at;
        const transfer = r.u(8);
        if (transfer === 13) {                // sRGB: rewrite the 8 bits as 1 (BT.709)
          const fixed = Uint8Array.from(rbsp);
          for (let i = 0; i < 8; i++) {
            const bit = (1 >> (7 - i)) & 1, pos = at + i, byte = pos >> 3, sh = 7 - (pos & 7);
            fixed[byte] = (fixed[byte] & ~(1 << sh)) | (bit << sh);
          }
          const check = new Bits(fixed); check.p = at;
          if (check.u(8) !== 1) return null;
          out = escape(fixed);
          changed = true;
        }
      }
      parts.push(Uint8Array.of(out.length >> 8, out.length & 255), out);
    }
    if (!changed) return null;
    parts.push(a.subarray(p));                // PPS count, PPS and any high-profile extension, untouched
    const total = parts.reduce((n, x) => n + x.length, 0);
    const res = new Uint8Array(total);
    let o = 0;
    for (const x of parts) { res.set(x, o); o += x.length; }
    return res;
  } catch {
    return null;
  }
}
