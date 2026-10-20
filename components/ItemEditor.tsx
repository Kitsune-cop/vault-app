"use client";

import { useState, type FormEvent } from "react";
import { DEFAULT_GENERATOR, generatePassword, type GeneratorOptions } from "@/lib/generator";
import { parseTotp } from "@/lib/totp";
import { emptyItem, type ItemType, type VaultItemData } from "@/lib/vault";
import { Icon } from "./Icons";
import { ErrorText, Field, SecretInput, Spinner, StrengthMeter } from "./ui";

const TYPES: { value: ItemType; label: string }[] = [
  { value: "login", label: "ล็อกอิน" },
  { value: "card", label: "บัตร" },
  { value: "note", label: "โน้ตลับ" },
];

function Generator({ onUse }: { onUse: (pw: string) => void }) {
  const [opts, setOpts] = useState<GeneratorOptions>(DEFAULT_GENERATOR);
  const update = (patch: Partial<GeneratorOptions>) => {
    const next = { ...opts, ...patch };
    setOpts(next);
    onUse(generatePassword(next));
  };
  const toggles: { key: keyof GeneratorOptions; label: string }[] = [
    { key: "upper", label: "ตัวพิมพ์ใหญ่ A–Z" },
    { key: "lower", label: "ตัวพิมพ์เล็ก a–z" },
    { key: "digits", label: "ตัวเลข 0–9" },
    { key: "symbols", label: "สัญลักษณ์ !@#$%" },
    { key: "avoidAmbiguous", label: "ตัดตัวที่สับสนง่าย (l, 1, O, 0)" },
  ];
  return (
    <div className="flex flex-col gap-3 border-t border-[#d3e9e4] bg-surface px-4 pb-2 pt-4">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold text-accent">ตัวสร้างรหัสผ่าน</div>
        <button type="button" onClick={() => onUse(generatePassword(opts))} className="flex min-h-9 items-center gap-1.5 text-[13px] font-medium text-accent">
          <Icon name="refresh" size={16} /> สุ่มใหม่
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-sm">
          <label htmlFor="gen-len">ความยาว</label>
          <span className="font-mono font-medium">{opts.length}</span>
        </div>
        <input
          id="gen-len"
          type="range"
          min={8}
          max={64}
          value={opts.length}
          onChange={(e) => update({ length: Number(e.target.value) })}
          className="w-full accent-[#0e6b5e]"
        />
      </div>
      <div className="flex flex-col">
        {toggles.map((t) => (
          <label key={t.key} className="flex min-h-11 items-center justify-between border-t border-[#eef0f2] text-[15px]">
            {t.label}
            <input
              type="checkbox"
              checked={Boolean(opts[t.key])}
              onChange={(e) => update({ [t.key]: e.target.checked })}
              className="h-[22px] w-[22px] accent-[#0e6b5e]"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export function ItemEditor({
  initial,
  folders,
  isNew,
  onSave,
  onCancel,
}: {
  initial?: VaultItemData;
  folders: string[];
  isNew: boolean;
  onSave: (data: VaultItemData) => Promise<void>;
  onCancel: () => void;
}) {
  const [data, setData] = useState<VaultItemData>(
    initial ?? { ...emptyItem("login"), password: generatePassword(DEFAULT_GENERATOR) },
  );
  const [showGen, setShowGen] = useState(isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<VaultItemData>) => setData((d) => ({ ...d, ...patch }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!data.name.trim()) return setError("ใส่ชื่อรายการก่อน");
    if (data.totp && !parseTotp(data.totp)) return setError("TOTP secret ไม่ถูกต้อง (ต้องเป็น base32 หรือ otpauth://)");
    setBusy(true);
    setError("");
    try {
      await onSave({ ...data, name: data.name.trim(), folder: data.folder.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-ground px-3 py-2 lg:px-8">
        <button type="button" onClick={onCancel} className="flex h-11 items-center px-2.5 text-[15px] text-ink-2">
          ยกเลิก
        </button>
        <div className="text-[17px] font-semibold">{isNew ? "เพิ่มรายการ" : "แก้ไขรายการ"}</div>
        <button type="submit" disabled={busy} className="flex h-10 items-center gap-2 rounded-[10px] bg-accent px-4 text-[15px] font-semibold text-white disabled:opacity-50">
          {busy ? <Spinner className="h-4 w-4" /> : null} บันทึก
        </button>
      </div>

      <div className="flex max-w-[720px] flex-col gap-4 px-5 pb-10 pt-4 lg:px-10">
        {isNew ? (
          <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-[#e6e8e4] p-1" role="radiogroup" aria-label="ประเภท">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={data.type === t.value}
                onClick={() => set({ type: t.value })}
                className={`h-9 rounded-[9px] text-sm ${
                  data.type === t.value ? "bg-surface font-semibold text-ink shadow-sm" : "text-ink-2"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}

        <Field label="ชื่อรายการ" id="name">
          <input id="name" value={data.name} onChange={(e) => set({ name: e.target.value })} className="field" autoFocus={isNew} />
        </Field>

        {data.type === "login" ? (
          <>
            <Field label="เว็บไซต์" id="url">
              <input id="url" inputMode="url" value={data.url} onChange={(e) => set({ url: e.target.value })} placeholder="example.com" className="field" />
            </Field>
            <Field label="Username / อีเมล" id="username">
              <input id="username" autoComplete="off" value={data.username} onChange={(e) => set({ username: e.target.value })} className="field" />
            </Field>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="pw" className="text-[13px] font-medium text-ink-2">
                รหัสผ่าน
              </label>
              <div className="overflow-hidden rounded-2xl border-[1.5px] border-accent bg-[#f2f8f7]">
                <div className="flex items-center gap-1 py-1.5 pl-3.5 pr-1.5">
                  <input
                    id="pw"
                    value={data.password}
                    onChange={(e) => set({ password: e.target.value })}
                    autoComplete="off"
                    spellCheck={false}
                    className="min-w-0 flex-1 bg-transparent font-mono text-[17px] tracking-wide outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGen((s) => !s)}
                    aria-expanded={showGen}
                    aria-label="ตัวสร้างรหัสผ่าน"
                    className="icon-btn text-accent hover:bg-accent-soft"
                  >
                    <Icon name="key" />
                  </button>
                </div>
                <div className="px-3.5 pb-3">
                  <StrengthMeter password={data.password} />
                </div>
                {showGen ? <Generator onUse={(pw) => set({ password: pw })} /> : null}
              </div>
            </div>

            <Field label="TOTP secret (ไม่บังคับ)" id="totp" hint="วาง secret แบบ base32 หรือลิงก์ otpauth:// เพื่อให้แอปสร้างรหัส 2FA ให้">
              <SecretInput id="totp" value={data.totp} onChange={(e) => set({ totp: e.target.value })} />
            </Field>
          </>
        ) : null}

        {data.type === "card" ? (
          <>
            <Field label="ชื่อบนบัตร" id="holder">
              <input id="holder" value={data.cardHolder} onChange={(e) => set({ cardHolder: e.target.value })} className="field" />
            </Field>
            <Field label="เลขบัตร" id="cnum">
              <SecretInput id="cnum" inputMode="numeric" value={data.cardNumber} onChange={(e) => set({ cardNumber: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="หมดอายุ (MM/YY)" id="cexp">
                <input id="cexp" value={data.cardExpiry} onChange={(e) => set({ cardExpiry: e.target.value })} placeholder="MM/YY" className="field" />
              </Field>
              <Field label="CVV" id="ccvv">
                <SecretInput id="ccvv" inputMode="numeric" value={data.cardCvv} onChange={(e) => set({ cardCvv: e.target.value })} />
              </Field>
            </div>
          </>
        ) : null}

        <Field label="โฟลเดอร์" id="folder">
          <input id="folder" list="folder-list" value={data.folder} onChange={(e) => set({ folder: e.target.value })} placeholder="เช่น งาน, ส่วนตัว" className="field" />
          <datalist id="folder-list">
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </Field>

        <Field label={data.type === "note" ? "เนื้อหา" : "โน้ต"} id="notes">
          <textarea
            id="notes"
            rows={data.type === "note" ? 10 : 3}
            value={data.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder={data.type === "note" ? "" : "เช่น คำถามกันลืม, recovery codes"}
            className="min-h-24 w-full resize-y rounded-xl border border-line-strong bg-surface px-3.5 py-3 text-base outline-none focus:border-accent"
          />
        </Field>

        <ErrorText>{error}</ErrorText>

        <div className="flex items-center gap-2.5 px-0.5 text-[13px] text-muted">
          <Icon name="lock" size={16} /> ทุกช่องจะถูกเข้ารหัสบนเครื่องก่อนบันทึก
        </div>
      </div>
    </form>
  );
}
