import { NalType } from "@/app/call/enums/call.enums"

export function nalUnits(d: Uint8Array) {
  const out: Uint8Array[] = []
  let start = -1
  for (let i = 0; i + 2 < d.length; i++) {
    if (d[i] !== 0 || d[i + 1] !== 0 || d[i + 2] !== 1) continue
    if (start >= 0) out.push(d.subarray(start, d[i - 1] === 0 ? i - 1 : i))
    start = i + 3
    i += 2
  }
  if (start >= 0) out.push(d.subarray(start))
  return out
}

export const nalType = (n: Uint8Array) => n[0] & 31
export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")

export function toAvc(nals: Uint8Array[]) {
  const keep = nals.filter((n) => ![NalType.Sps, NalType.Pps, NalType.Aud].includes(nalType(n) as NalType))
  const out = new Uint8Array(keep.reduce((s, n) => s + 4 + n.length, 0))
  const view = new DataView(out.buffer)
  let p = 0
  for (const n of keep) {
    view.setUint32(p, n.length)
    out.set(n, p + 4)
    p += 4 + n.length
  }
  return out
}

export function avcC(sps: Uint8Array, pps: Uint8Array) {
  const out = new Uint8Array(11 + sps.length + pps.length)
  out.set([1, sps[1], sps[2], sps[3], 0xff, 0xe1, sps.length >> 8, sps.length & 255])
  out.set(sps, 8)
  out.set([1, pps.length >> 8, pps.length & 255], 8 + sps.length)
  out.set(pps, 11 + sps.length)
  return out
}

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
