import {
  DEFAULT_KDF,
  VAULT_KEY_AAD,
  deriveMasterKey,
  deriveRecoveryKey,
  generateRecoveryCode,
  importVaultKey,
  open,
  openJSON,
  randomBytes,
  seal,
  sealJSON,
  toB64,
  type KdfParams,
  type Sealed,
} from "./crypto";
import { getSupabase } from "./supabase";

export type ItemType = "login" | "card" | "note";

export interface VaultItemData {
  type: ItemType;
  name: string;
  url: string;
  username: string;
  password: string;
  totp: string;
  notes: string;
  folder: string;
  favorite: boolean;
  cardHolder: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvv: string;
}

export interface VaultItem extends VaultItemData {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultMeta {
  user_id: string;
  kdf_salt: string;
  kdf_params: KdfParams;
  wrapped_key: Sealed;
  recovery_wrapped_key: Sealed;
}

export class WrongSecretError extends Error {
  constructor(message = "รหัสไม่ถูกต้อง") {
    super(message);
    this.name = "WrongSecretError";
  }
}

export function emptyItem(type: ItemType = "login"): VaultItemData {
  return {
    type,
    name: "",
    url: "",
    username: "",
    password: "",
    totp: "",
    notes: "",
    folder: "",
    favorite: false,
    cardHolder: "",
    cardNumber: "",
    cardExpiry: "",
    cardCvv: "",
  };
}

const itemAad = (id: string) => `vault-item-v1:${id}`;

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// ---------- meta ----------
export async function fetchMeta(): Promise<VaultMeta | null> {
  const { data, error } = await getSupabase().from("vault_meta").select("*").maybeSingle();
  fail(error);
  return (data as VaultMeta | null) ?? null;
}

/** สร้างคลังใหม่: สุ่ม vaultKey แล้วห่อด้วย Master password และ Recovery code */
export async function createVault(
  master: string,
): Promise<{ key: CryptoKey; recoveryCode: string; meta: VaultMeta }> {
  const salt = toB64(randomBytes(16));
  const masterKey = await deriveMasterKey(master, salt, DEFAULT_KDF);
  const raw = randomBytes(32);
  const recoveryCode = generateRecoveryCode();
  const recoveryKey = await deriveRecoveryKey(recoveryCode);

  const wrapped = await seal(masterKey, raw, VAULT_KEY_AAD);
  const recoveryWrapped = await seal(recoveryKey, raw, VAULT_KEY_AAD);
  const key = await importVaultKey(raw);

  const { data, error } = await getSupabase()
    .from("vault_meta")
    .insert({
      kdf_salt: salt,
      kdf_params: DEFAULT_KDF,
      wrapped_key: wrapped,
      recovery_wrapped_key: recoveryWrapped,
    })
    .select("*")
    .single();
  fail(error);
  return { key, recoveryCode, meta: data as VaultMeta };
}

export async function unlockVault(meta: VaultMeta, master: string): Promise<CryptoKey> {
  const masterKey = await deriveMasterKey(master, meta.kdf_salt, meta.kdf_params);
  try {
    const raw = await open(masterKey, meta.wrapped_key, VAULT_KEY_AAD);
    return await importVaultKey(raw);
  } catch {
    throw new WrongSecretError("Master password ไม่ถูกต้อง");
  }
}

async function rewrapWithNewMaster(
  userId: string,
  raw: Uint8Array<ArrayBuffer>,
  newMaster: string,
): Promise<VaultMeta> {
  const salt = toB64(randomBytes(16));
  const masterKey = await deriveMasterKey(newMaster, salt, DEFAULT_KDF);
  const wrapped = await seal(masterKey, raw, VAULT_KEY_AAD);
  const { data, error } = await getSupabase()
    .from("vault_meta")
    .update({ kdf_salt: salt, kdf_params: DEFAULT_KDF, wrapped_key: wrapped })
    .eq("user_id", userId)
    .select("*")
    .single();
  fail(error);
  return data as VaultMeta;
}

/** ใช้ Recovery code ปลดล็อก แล้วตั้ง Master password ใหม่ */
export async function recoverVault(
  meta: VaultMeta,
  recoveryCode: string,
  newMaster: string,
): Promise<{ key: CryptoKey; meta: VaultMeta }> {
  const recoveryKey = await deriveRecoveryKey(recoveryCode);
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = new Uint8Array(await open(recoveryKey, meta.recovery_wrapped_key, VAULT_KEY_AAD));
  } catch {
    throw new WrongSecretError("Recovery code ไม่ถูกต้อง");
  }
  const newMeta = await rewrapWithNewMaster(meta.user_id, raw, newMaster);
  return { key: await importVaultKey(raw), meta: newMeta };
}

export async function changeMasterPassword(
  meta: VaultMeta,
  current: string,
  next: string,
): Promise<VaultMeta> {
  const masterKey = await deriveMasterKey(current, meta.kdf_salt, meta.kdf_params);
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = new Uint8Array(await open(masterKey, meta.wrapped_key, VAULT_KEY_AAD));
  } catch {
    throw new WrongSecretError("Master password ปัจจุบันไม่ถูกต้อง");
  }
  const newMeta = await rewrapWithNewMaster(meta.user_id, raw, next);
  raw.fill(0);
  return newMeta;
}

// ---------- items ----------
interface ItemRow {
  id: string;
  iv: string;
  ciphertext: string;
  created_at: string;
  updated_at: string;
}

async function decodeRow(key: CryptoKey, row: ItemRow): Promise<VaultItem> {
  const data = await openJSON<Partial<VaultItemData>>(
    key,
    { iv: row.iv, ct: row.ciphertext },
    itemAad(row.id),
  );
  return {
    ...emptyItem(data.type ?? "login"),
    ...data,
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listItems(key: CryptoKey): Promise<{ items: VaultItem[]; broken: number }> {
  const { data, error } = await getSupabase()
    .from("vault_items")
    .select("id, iv, ciphertext, created_at, updated_at");
  fail(error);
  const results = await Promise.allSettled((data as ItemRow[]).map((r) => decodeRow(key, r)));
  const items: VaultItem[] = [];
  let broken = 0;
  for (const r of results) {
    if (r.status === "fulfilled") items.push(r.value);
    else broken++;
  }
  return { items, broken };
}

export async function saveItem(key: CryptoKey, data: VaultItemData, id?: string): Promise<VaultItem> {
  const itemId = id ?? crypto.randomUUID();
  const sealed = await sealJSON(key, data, itemAad(itemId));
  const { data: row, error } = await getSupabase()
    .from("vault_items")
    .upsert({ id: itemId, iv: sealed.iv, ciphertext: sealed.ct })
    .select("id, iv, ciphertext, created_at, updated_at")
    .single();
  fail(error);
  const r = row as ItemRow;
  return { ...data, id: r.id, createdAt: r.created_at, updatedAt: r.updated_at };
}

export async function deleteItem(id: string): Promise<void> {
  const { error } = await getSupabase().from("vault_items").delete().eq("id", id);
  fail(error);
}

/** ส่งออกข้อมูลแบบที่ยังเข้ารหัสอยู่ (ปลอดภัยที่จะเก็บไว้นอกเครื่อง) */
export async function exportEncryptedBackup(): Promise<Blob> {
  const sb = getSupabase();
  const [meta, items] = await Promise.all([
    sb.from("vault_meta").select("kdf_salt, kdf_params, wrapped_key, recovery_wrapped_key").maybeSingle(),
    sb.from("vault_items").select("id, iv, ciphertext, created_at, updated_at"),
  ]);
  fail(meta.error);
  fail(items.error);
  const payload = {
    format: "vault-backup-v1",
    exportedAt: new Date().toISOString(),
    meta: meta.data,
    items: items.data,
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
}
