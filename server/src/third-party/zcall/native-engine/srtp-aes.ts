'use strict';
/**
 * SRTP AES_CM_128_HMAC_SHA1_80 as used by Zalo zrtc (libsrtp2).
 *
 * Master key+salt = first 30 bytes of sessId (parseCallConfig when srtpKey empty).
 * Session keys via RFC 3711 KDF. Wire: 5-byte ZRTP + RTP (PT 112, X=1, 8-byte
 * extension) + encrypted opus + 10-byte HMAC. Verified on Máy-120 capture
 * (HMAC 20/20, libopus 80/80).
 */
import crypto from 'node:crypto';

export interface SrtpKeys {
  enc: Buffer;
  auth: Buffer;
  salt: Buffer;
}

export interface RtpParts {
  seq: number;
  ssrc: number;
  hdr: Buffer;
  payload: Buffer;
}

export interface UnprotectedRtp {
  seq: number;
  ssrc: number;
  opus: Buffer;
}

function aesEcb(key: Buffer, block: Buffer): Buffer {
  const c = crypto.createCipheriv('aes-128-ecb', key, null);
  c.setAutoPadding(false);
  return Buffer.concat([c.update(block), c.final()]);
}

function aesCmExpand(key: Buffer, iv16: Buffer, n: number): Buffer {
  const out = Buffer.alloc(n);
  let off = 0;
  let counter = 0;
  while (off < n) {
    const blk = Buffer.from(iv16);
    blk[14] = (counter >> 8) & 0xff;
    blk[15] = counter & 0xff;
    const enc = aesEcb(key, blk);
    const take = Math.min(16, n - off);
    enc.copy(out, off, 0, take);
    off += take;
    counter += 1;
  }
  return out;
}

function kdf(masterKey: Buffer, masterSalt: Buffer, label: number, outLen: number): Buffer {
  const x = Buffer.alloc(16);
  masterSalt.copy(x, 0, 0, Math.min(14, masterSalt.length));
  x[7] ^= label;
  return aesCmExpand(masterKey, x, outLen);
}

export function sessionKeys(master30: Buffer): SrtpKeys {
  if (!Buffer.isBuffer(master30) || master30.length < 30) {
    throw new TypeError('master key+salt must be 30 bytes');
  }
  const mk = master30.subarray(0, 16);
  const ms = master30.subarray(16, 30);
  return {
    enc: kdf(mk, ms, 0x00, 16),
    auth: kdf(mk, ms, 0x01, 20),
    salt: kdf(mk, ms, 0x02, 14),
  };
}

export function masterFromSessId(sessId: Buffer | string): Buffer {
  const b = Buffer.isBuffer(sessId) ? sessId : Buffer.from(String(sessId), 'utf8');
  if (b.length < 30) throw new TypeError('sessId shorter than 30');
  return b.subarray(0, 30);
}

export function packetIv(sessionSalt: Buffer, ssrc: number, seq: number, roc = 0): Buffer {
  const idx = roc * 0x10000 + (seq & 0xffff);
  const shifted = idx * 0x10000; // 64-bit (est << 16)
  const iv = Buffer.alloc(16);
  iv.writeUInt32BE(ssrc >>> 0, 4);
  iv.writeUInt32BE(Math.floor(shifted / 0x100000000), 8);
  iv.writeUInt32BE(shifted >>> 0, 12);
  const s16 = Buffer.alloc(16);
  sessionSalt.copy(s16, 0, 0, 14);
  for (let i = 0; i < 16; i++) iv[i] ^= s16[i];
  return iv;
}

export function parseRtp(buf: Buffer): RtpParts | null {
  if (buf.length < 12) return null;
  const x = (buf[0] >> 4) & 1;
  const seq = buf.readUInt16BE(2);
  const ssrc = buf.readUInt32BE(8);
  let off = 12 + 4 * (buf[0] & 0x0f);
  if (x) {
    if (buf.length < off + 4) return null;
    const words = buf.readUInt16BE(off + 2);
    off += 4 + 4 * words;
  }
  if (off > buf.length) return null;
  return { seq, ssrc, hdr: buf.subarray(0, off), payload: buf.subarray(off) };
}

export function unprotectRtp(rtpBuf: Buffer, keys: SrtpKeys, roc = 0): UnprotectedRtp | null {
  const p = parseRtp(rtpBuf);
  if (!p || p.payload.length < 10) return null;
  const body = p.payload.subarray(0, p.payload.length - 10);
  const tag = p.payload.subarray(p.payload.length - 10);
  const rocBuf = Buffer.alloc(4);
  rocBuf.writeUInt32BE(roc >>> 0, 0);
  const mac = crypto.createHmac('sha1', keys.auth).update(p.hdr).update(body).update(rocBuf).digest().subarray(0, 10);
  if (!crypto.timingSafeEqual(mac, tag)) return null;
  const iv = packetIv(keys.salt, p.ssrc, p.seq, roc);
  const ks = aesCmExpand(keys.enc, iv, body.length);
  const plain = Buffer.alloc(body.length);
  for (let i = 0; i < body.length; i++) plain[i] = body[i] ^ ks[i];
  return { seq: p.seq, ssrc: p.ssrc, opus: plain };
}

export function protectRtp(rtpHeaderAndExt: Buffer, opus: Buffer, keys: SrtpKeys, seq: number, ssrc: number, roc = 0): Buffer {
  const iv = packetIv(keys.salt, ssrc, seq, roc);
  const ks = aesCmExpand(keys.enc, iv, opus.length);
  const body = Buffer.alloc(opus.length);
  for (let i = 0; i < opus.length; i++) body[i] = opus[i] ^ ks[i];
  const rocBuf = Buffer.alloc(4);
  rocBuf.writeUInt32BE(roc >>> 0, 0);
  const mac = crypto.createHmac('sha1', keys.auth).update(rtpHeaderAndExt).update(body).update(rocBuf).digest().subarray(0, 10);
  return Buffer.concat([rtpHeaderAndExt, body, mac]);
}
