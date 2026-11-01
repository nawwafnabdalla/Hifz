// Minimal MP3 inspection: where the audio frames start (skipping an ID3v2 tag and a Xing/Info header frame) and whether the bitrate is constant.
// Phrase windows are cut out of a whole-surah MP3 by byte position, which is only exact for constant-bitrate files.
const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }
function header(buf, p) {
  if (!(buf[p] === 0xff && (buf[p + 1] & 0xe0) === 0xe0)) return null
  const h = buf.readUInt32BE(p), ver = (h >> 19) & 3, layer = (h >> 17) & 3, bi = (h >> 12) & 15, si = (h >> 10) & 3, pad = (h >> 9) & 1, mode = (h >> 6) & 3
  if (layer !== 1 || ver === 1 || bi === 0 || bi === 15 || si === 3) return null           // layer III only
  const kbps = (ver === 3 ? BR1 : BR2)[bi], sr = SR[ver][si]
  return { kbps, sr, size: Math.floor(((ver === 3 ? 144 : 72) * kbps * 1000) / sr) + pad, mono: mode === 3, mpeg1: ver === 3, crc: !((h >> 16) & 1) }
}
export function inspectMp3(buf) {
  let p = 0
  if (buf.toString('latin1', 0, 3) === 'ID3') p = 10 + (((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f)) + (buf[5] & 0x10 ? 10 : 0)
  while (p < buf.length - 4 && !header(buf, p)) p++
  let h = header(buf, p)
  if (!h) throw new Error('not an MP3 (no frame found)')
  const side = h.mpeg1 ? (h.mono ? 17 : 32) : (h.mono ? 9 : 17), tag = buf.toString('latin1', p + 4 + side + (h.crc ? 2 : 0), p + 8 + side + (h.crc ? 2 : 0))
  if (tag === 'Xing' || tag === 'Info') p += h.size                                           // a header frame, not audio
  const first = p, rates = new Set()
  let frames = 0
  for (let q = first; q < buf.length - 4 && frames < 2000; frames++) { const f = header(buf, q); if (!f) break; rates.add(f.kbps); q += f.size }
  h = header(buf, first)
  return { dataOffset: first, kbps: h.kbps, sampleRate: h.sr, constantBitrate: rates.size === 1 && tag !== 'Xing', xing: tag === 'Xing' }
}
