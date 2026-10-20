export interface GeneratorOptions {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
  avoidAmbiguous: boolean;
}

export const DEFAULT_GENERATOR: GeneratorOptions = {
  length: 20,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: false,
};

const SETS = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijklmnopqrstuvwxyz",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?/",
};
const AMBIGUOUS = /[Il1O0o]/g;

/** สุ่มเลขแบบไม่เอนเอียง (rejection sampling) */
function randomIndex(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % max;
}

export function generatePassword(opts: GeneratorOptions): string {
  const pools = (Object.keys(SETS) as (keyof typeof SETS)[])
    .filter((k) => opts[k])
    .map((k) => (opts.avoidAmbiguous ? SETS[k].replace(AMBIGUOUS, "") : SETS[k]));
  if (pools.length === 0) return "";
  const all = pools.join("");
  const length = Math.max(opts.length, pools.length);
  // รับประกันว่ามีอย่างน้อย 1 ตัวจากแต่ละชุดที่เลือก
  const chars = pools.map((p) => p[randomIndex(p.length)]);
  while (chars.length < length) chars.push(all[randomIndex(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export interface Strength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  bits: number;
}

const LABELS = ["อ่อนมาก", "อ่อน", "พอใช้", "ดี", "แข็งแรงมาก"];

/** ประมาณความแข็งแรงจาก entropy (หยาบๆ แต่พอใช้เตือนได้) */
export function estimateStrength(pw: string): Strength {
  if (!pw) return { score: 0, label: LABELS[0], bits: 0 };
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33;
  let bits = pw.length * Math.log2(Math.max(pool, 2));
  // ลดคะแนนถ้ามีตัวซ้ำติดกันเยอะหรือเป็นรูปแบบเรียงลำดับ
  if (/(.)\1{2,}/.test(pw)) bits *= 0.75;
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf|password|admin)/i.test(pw)) bits *= 0.5;
  const score = bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  return { score, label: LABELS[score], bits: Math.round(bits) };
}
