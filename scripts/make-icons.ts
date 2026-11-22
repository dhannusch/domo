// Draws Domo's app icons (paper ground, a graphite ring around a charcoal seal) as PNGs,
// with no image tooling: `node scripts/make-icons.ts`.
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { deflateSync } from "node:zlib"

const PAPER = [0xf5, 0xf5, 0xf5]
const INK = [0x29, 0x29, 0x29]
const ACCENT = [0x50, 0x50, 0x50]

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (bytes: Buffer) => {
  let c = 0xffffffff
  for (const b of bytes) c = (crcTable[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type: string, data: Buffer) => {
  const body = Buffer.concat([Buffer.from(type), data])
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc(body), 8 + data.length)
  return out
}

/** Coverage of a pixel by a disc, 4×4 supersampled for smooth edges. */
const cover = (x: number, y: number, c: number, r: number) => {
  let hits = 0
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const dx = x + (i + 0.5) / 4 - c
      const dy = y + (j + 0.5) / 4 - c
      if (dx * dx + dy * dy <= r * r) hits++
    }
  return hits / 16
}
const mix = (a: Array<number>, b: Array<number>, t: number) =>
  a.map((v, i) => Math.round(v + ((b[i] ?? 0) - v) * t))

const icon = (size: number, scale: number) => {
  const c = size / 2
  const ring = size * 0.34 * scale
  const width = size * 0.035 * scale
  const seal = size * 0.2 * scale
  const rows: Array<Buffer> = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3)
    for (let x = 0; x < size; x++) {
      let px = PAPER
      px = mix(px, INK, cover(x, y, c, ring) - cover(x, y, c, ring - width))
      px = mix(px, ACCENT, cover(x, y, c, seal))
      row.set(px, 1 + x * 3)
    }
    rows.push(row)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

const dir = join(import.meta.dirname, "../apps/web/public/icons")
writeFileSync(join(dir, "icon-192.png"), icon(192, 1))
writeFileSync(join(dir, "icon-512.png"), icon(512, 1))
writeFileSync(join(dir, "icon-maskable-512.png"), icon(512, 0.8))
writeFileSync(join(dir, "apple-touch-icon.png"), icon(180, 1))
