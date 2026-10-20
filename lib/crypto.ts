/**
 * การเข้ารหัสทั้งหมดเกิดขึ้นใน browser เท่านั้น
 *
 * โครงสร้างกุญแจ:
 *   Master password ──Argon2id──▶ masterKey ──AES-GCM──▶ ห่อ (wrap) vaultKey
 *   Recovery code   ──SHA-256──▶  recoveryKey ─AES-GCM─▶ ห่อ vaultKey อีกชุด
 *   vaultKey (สุ่ม 256-bit) ──AES-GCM──▶ เข้ารหัสแต่ละรายการ
 *
 * ข้อดี: เปลี่ยน Master password หรือกู้คืนด้วย Recovery code ได้
 * โดยไม่ต้องเข้ารหัสทุกรายการใหม่
 */
import { argon2id } from "hash-wasm";

export interface KdfParams {
  alg: "argon2id";
  iterations: number;
  memoryKiB: number;
  parallelism: number;
}

export interface Sealed {
  iv: string;
  ct: string;
}

export const DEFAULT_KDF: KdfParams = {
  alg: "argon2id",
  iterations: 3,
  memoryKiB: 64 * 1024,
  parallelism: 1,
};

const enc = new TextEncoder();
const dec = new TextDecoder();

// ---------- base64 ----------
export function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

// ---------- key derivation ----------
export async function deriveMasterKey(
  master: string,
  saltB64: string,
  params: KdfParams = DEFAULT_KDF,
): Promise<CryptoKey> {
  const raw = (await argon2id({
    password: master.normalize("NFKC"),
    salt: fromB64(saltB64),
    iterations: params.iterations,
    memorySize: params.memoryKiB,
    parallelism: params.parallelism,
    hashLength: 32,
    outputType: "binary",
  })) as Uint8Array;
  const key = await crypto.subtle.importKey("raw", new Uint8Array(raw), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  raw.fill(0);
  return key;
}

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ไม่มี I O 0 1

/** สร้าง Recovery code สุ่ม 160 บิต รูปแบบ XXXX-XXXX-... (8 กลุ่ม) */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(32);
  let out = "";
  for (let i = 0; i < 32; i++) {
    out += RECOVERY_ALPHABET[bytes[i] & 31];
    if (i % 4 === 3 && i !== 31) out += "-";
  }
  return out;
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function deriveRecoveryKey(code: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    enc.encode("vault-recovery-v1:" + normalizeRecoveryCode(code)),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

// ---------- AES-GCM ----------
export async function seal(key: CryptoKey, data: Uint8Array<ArrayBuffer>, aad: string): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(aad) },
    key,
    data,
  );
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

export async function open(key: CryptoKey, sealed: Sealed, aad: string): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(sealed.iv), additionalData: enc.encode(aad) },
    key,
    fromB64(sealed.ct),
  );
  return new Uint8Array(pt);
}

export async function sealJSON(key: CryptoKey, value: unknown, aad: string): Promise<Sealed> {
  return seal(key, enc.encode(JSON.stringify(value)), aad);
}

export async function openJSON<T>(key: CryptoKey, sealed: Sealed, aad: string): Promise<T> {
  return JSON.parse(dec.decode(await open(key, sealed, aad))) as T;
}

// ---------- vault key ----------
export const VAULT_KEY_AAD = "vault-key-v1";

/** นำ raw bytes ของ vaultKey เข้าเป็น CryptoKey แบบ non-extractable แล้วล้าง bytes ทิ้ง */
export async function importVaultKey(raw: Uint8Array): Promise<CryptoKey> {
  const key = await crypto.subtle.importKey("raw", new Uint8Array(raw), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  raw.fill(0);
  return key;
}
