/**
 * QR Code (byte mode, versions 1–3, EC-M) as SVG.
 * Offline generator — no network. Payload should be a short verification id.
 */

const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)

;(function initGf() {
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
})()

function gfMul(a: number, b: number): number {
  if (!a || !b) return 0
  return EXP[LOG[a] + LOG[b]]
}

function rsGenerator(ecCount: number): number[] {
  let poly = [1]
  for (let i = 0; i < ecCount; i++) {
    const next = new Array(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]
      next[j + 1] ^= gfMul(poly[j], EXP[i])
    }
    poly = next
  }
  return poly
}

function rsEncode(data: number[], ecCount: number): number[] {
  const gen = rsGenerator(ecCount)
  const ecc = new Array(ecCount).fill(0)
  for (const byte of data) {
    const factor = byte ^ ecc[0]
    ecc.shift()
    ecc.push(0)
    for (let i = 0; i < ecCount; i++) {
      ecc[i] ^= gfMul(gen[i + 1], factor)
    }
  }
  return ecc
}

type VersionSpec = {
  version: number
  size: number
  dataCodewords: number
  ecCount: number
  blocks: number
  align: number[]
}

const VERSIONS: VersionSpec[] = [
  { version: 1, size: 21, dataCodewords: 16, ecCount: 10, blocks: 1, align: [] },
  { version: 2, size: 25, dataCodewords: 28, ecCount: 16, blocks: 1, align: [18] },
  { version: 3, size: 29, dataCodewords: 44, ecCount: 26, blocks: 2, align: [22] },
]

function pickVersion(byteLen: number): VersionSpec {
  for (const v of VERSIONS) {
    const capacity = Math.floor((v.dataCodewords * 8 - 16) / 8)
    if (byteLen <= capacity) return v
  }
  return VERSIONS[VERSIONS.length - 1]
}

function encodeData(text: string, spec: VersionSpec): number[] {
  const bytes = Array.from(Buffer.from(text, 'utf8')).slice(
    0,
    Math.floor((spec.dataCodewords * 8 - 16) / 8)
  )
  const bits: number[] = []
  const push = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1)
  }
  push(0b0100, 4)
  push(bytes.length, 8)
  for (const b of bytes) push(b, 8)
  push(0, Math.min(4, spec.dataCodewords * 8 - bits.length))
  while (bits.length % 8) bits.push(0)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0
    for (let j = 0; j < 8; j++) v = (v << 1) | (bits[i + j] || 0)
    data.push(v)
  }
  const pads = [0xec, 0x11]
  let p = 0
  while (data.length < spec.dataCodewords) {
    data.push(pads[p % 2])
    p += 1
  }
  return data.slice(0, spec.dataCodewords)
}

function addEc(data: number[], spec: VersionSpec): number[] {
  if (spec.blocks === 1) {
    return data.concat(rsEncode(data, spec.ecCount))
  }
  const blockLen = Math.floor(spec.dataCodewords / spec.blocks)
  const ecLen = Math.floor(spec.ecCount / spec.blocks)
  const blocks: number[][] = []
  const eccs: number[][] = []
  for (let i = 0; i < spec.blocks; i++) {
    const slice = data.slice(i * blockLen, (i + 1) * blockLen)
    blocks.push(slice)
    eccs.push(rsEncode(slice, ecLen))
  }
  const out: number[] = []
  for (let i = 0; i < blockLen; i++) {
    for (const b of blocks) out.push(b[i])
  }
  for (let i = 0; i < ecLen; i++) {
    for (const e of eccs) out.push(e[i])
  }
  return out
}

function inFinder(row: number, col: number, size: number): boolean {
  const in7 = (r: number, c: number) => r >= 0 && r < 7 && c >= 0 && c < 7
  return (
    in7(row, col) ||
    in7(row, col - (size - 7)) ||
    in7(row - (size - 7), col)
  )
}

function placeFinders(grid: number[][], size: number): void {
  const draw = (r0: number, c0: number) => {
    for (let r = -1; r < 8; r++) {
      for (let c = -1; c < 8; c++) {
        const rr = r0 + r
        const cc = c0 + c
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue
        const on =
          r === -1 ||
          c === -1 ||
          r === 7 ||
          c === 7
            ? 0
            : r === 0 ||
                c === 0 ||
                r === 6 ||
                c === 6 ||
                (r >= 2 && r <= 4 && c >= 2 && c <= 4)
              ? 1
              : 0
        grid[rr][cc] = on
      }
    }
  }
  draw(0, 0)
  draw(0, size - 7)
  draw(size - 7, 0)
}

function placeTiming(grid: number[][], size: number): void {
  for (let i = 8; i < size - 8; i++) {
    grid[6][i] = i % 2 === 0 ? 1 : 0
    grid[i][6] = i % 2 === 0 ? 1 : 0
  }
}

function placeAlign(grid: number[][], spec: VersionSpec): void {
  for (const pos of spec.align) {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const on = r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0) ? 1 : 0
        grid[pos + r][pos + c] = on
      }
    }
  }
}

function reserved(row: number, col: number, size: number, spec: VersionSpec): boolean {
  if (inFinder(row, col, size)) return true
  if (row === 6 || col === 6) return true
  if (row === 8 && (col < 9 || col > size - 9)) return true
  if (col === 8 && (row < 9 || row > size - 8)) return true
  for (const pos of spec.align) {
    if (Math.abs(row - pos) <= 2 && Math.abs(col - pos) <= 2) return true
  }
  return false
}

function maskBit(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0:
      return (r + c) % 2 === 0
    case 1:
      return r % 2 === 0
    case 2:
      return c % 3 === 0
    case 3:
      return (r + c) % 3 === 0
    case 4:
      return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0
    case 5:
      return ((r * c) % 2) + ((r * c) % 3) === 0
    case 6:
      return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0
    default:
      return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  }
}

const FORMAT_MASKS = [
  0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976,
]

function placeFormat(grid: number[][], size: number, mask: number): void {
  const bits = FORMAT_MASKS[mask]
  const positions: Array<[number, number]> = []
  for (let i = 0; i < 6; i++) positions.push([8, i])
  positions.push([8, 7], [8, 8], [7, 8])
  for (let i = 5; i >= 0; i--) positions.push([i, 8])
  for (let i = 0; i < 8; i++) {
    const bit = (bits >> (14 - i)) & 1
    const [r, c] = positions[i]
    grid[r][c] = bit
  }
  for (let i = 0; i < 8; i++) {
    const bit = (bits >> (14 - i)) & 1
    if (i < 7) grid[size - 1 - i][8] = bit
    else grid[8][size - 8 + (i - 7)] = bit
  }
  for (let i = 8; i < 15; i++) {
    const bit = (bits >> (14 - i)) & 1
    grid[8][size - 15 + i] = bit
  }
  grid[size - 8][8] = 1
}

function placeData(grid: number[][], spec: VersionSpec, codewords: number[], mask: number): void {
  const size = spec.size
  const bits: number[] = []
  for (const b of codewords) {
    for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1)
  }
  let bitI = 0
  let upward = true
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1
    for (let n = 0; n < size; n++) {
      const row = upward ? size - 1 - n : n
      for (const c of [col, col - 1]) {
        if (reserved(row, c, size, spec)) continue
        let bit = bits[bitI] || 0
        bitI += 1
        if (maskBit(mask, row, c)) bit ^= 1
        grid[row][c] = bit
      }
    }
    upward = !upward
  }
}

function penalty(grid: number[][]): number {
  const size = grid.length
  let score = 0
  const runPenalty = (run: number) => (run >= 5 ? 3 + (run - 5) : 0)
  for (let r = 0; r < size; r++) {
    let run = 1
    for (let c = 1; c < size; c++) {
      if (grid[r][c] === grid[r][c - 1]) run += 1
      else {
        score += runPenalty(run)
        run = 1
      }
    }
    score += runPenalty(run)
  }
  for (let c = 0; c < size; c++) {
    let run = 1
    for (let r = 1; r < size; r++) {
      if (grid[r][c] === grid[r - 1][c]) run += 1
      else {
        score += runPenalty(run)
        run = 1
      }
    }
    score += runPenalty(run)
  }
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = grid[r][c]
      if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) {
        score += 3
      }
    }
  }
  let dark = 0
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) dark += grid[r][c]
  }
  score += Math.abs((dark * 100) / (size * size) - 50) / 5 * 10
  return score
}

export function qrMatrix(text: string): number[][] {
  const payload = String(text || 'SOFIA')
  const spec = pickVersion(Buffer.byteLength(payload, 'utf8'))
  const data = encodeData(payload, spec)
  const codewords = addEc(data, spec)
  let best: number[][] | null = null
  let bestScore = Infinity
  for (let mask = 0; mask < 8; mask++) {
    const grid = Array.from({ length: spec.size }, () =>
      new Array(spec.size).fill(0)
    )
    placeFinders(grid, spec.size)
    placeTiming(grid, spec.size)
    placeAlign(grid, spec)
    placeFormat(grid, spec.size, mask)
    placeData(grid, spec, codewords, mask)
    const score = penalty(grid)
    if (score < bestScore) {
      bestScore = score
      best = grid.map((row) => row.slice())
    }
  }
  return best as number[][]
}

export function qrSvg(text: string, sizePx = 120): string {
  const matrix = qrMatrix(text)
  const n = matrix.length
  const quiet = 2
  const dim = n + quiet * 2
  const cell = sizePx / dim
  const rects: string[] = [
    `<rect width="${sizePx}" height="${sizePx}" fill="#fff"/>`,
  ]
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!matrix[r][c]) continue
      const x = (c + quiet) * cell
      const y = (r + quiet) * cell
      rects.push(
        `<rect x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${cell.toFixed(3)}" height="${cell.toFixed(3)}" fill="#111"/>`
      )
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sizePx} ${sizePx}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges">${rects.join('')}</svg>`
}
