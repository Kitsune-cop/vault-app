/** สร้างรหัส TOTP (RFC 6238) จาก secret แบบ base32 หรือ otpauth:// URI */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

interface TotpConfig {
  secret: Uint8Array<ArrayBuffer>;
  digits: number;
  period: number;
  algorithm: "SHA-1" | "SHA-256" | "SHA-512";
}

function base32Decode(input: string): Uint8Array<ArrayBuffer> {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("secret ไม่ใช่ base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function parseTotp(input: string): TotpConfig | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    if (raw.startsWith("otpauth://")) {
      const u = new URL(raw);
      const secret = u.searchParams.get("secret");
      if (!secret) return null;
      const alg = (u.searchParams.get("algorithm") ?? "SHA1").toUpperCase();
      return {
        secret: base32Decode(secret),
        digits: Number(u.searchParams.get("digits") ?? 6),
        period: Number(u.searchParams.get("period") ?? 30),
        algorithm: alg === "SHA256" ? "SHA-256" : alg === "SHA512" ? "SHA-512" : "SHA-1",
      };
    }
    return { secret: base32Decode(raw), digits: 6, period: 30, algorithm: "SHA-1" };
  } catch {
    return null;
  }
}

export async function totpCode(
  cfg: TotpConfig,
  now = Date.now(),
): Promise<{ code: string; remaining: number }> {
  const counter = Math.floor(now / 1000 / cfg.period);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const key = await crypto.subtle.importKey(
    "raw",
    cfg.secret,
    { name: "HMAC", hash: cfg.algorithm },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const offset = mac[mac.length - 1] & 0x0f;
  const bin =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];
  const code = (bin % 10 ** cfg.digits).toString().padStart(cfg.digits, "0");
  const remaining = cfg.period - (Math.floor(now / 1000) % cfg.period);
  return { code, remaining };
}
