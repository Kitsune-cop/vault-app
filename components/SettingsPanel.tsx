"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";
import { estimateStrength } from "@/lib/generator";
import { changeMasterPassword, exportEncryptedBackup, type VaultMeta } from "@/lib/vault";
import { Icon } from "./Icons";
import { ErrorText, Field, SecretInput, Spinner, StrengthMeter } from "./ui";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <h2 className="m-0 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function TwoFactor() {
  const [status, setStatus] = useState<"loading" | "off" | "enrolling" | "on">("loading");
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const { data } = await getSupabase().auth.mfa.listFactors();
    const verified = data?.totp?.find((f) => f.status === "verified");
    if (verified) {
      setFactorId(verified.id);
      setStatus("on");
    } else setStatus("off");
  }

  useEffect(() => {
    refresh();
  }, []);

  async function start() {
    setBusy(true);
    setError("");
    const mfa = getSupabase().auth.mfa;
    // ล้าง factor ที่ค้างไว้แต่ยังไม่ยืนยัน
    const { data: list } = await mfa.listFactors();
    for (const f of list?.all ?? []) {
      if (f.status !== "verified") await mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await mfa.enroll({ factorType: "totp", friendlyName: `vault-${Date.now()}` });
    setBusy(false);
    if (error || !data) return setError(error?.message ?? "เปิด 2FA ไม่สำเร็จ");
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
    setStatus("enrolling");
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await getSupabase().auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (error) return setError("รหัสไม่ถูกต้อง ลองรหัสล่าสุดจากแอป");
    setStatus("on");
  }

  async function disable() {
    if (!confirm("ปิด 2FA? บัญชีจะเหลือแค่รหัสผ่านอย่างเดียว")) return;
    const { error } = await getSupabase().auth.mfa.unenroll({ factorId });
    if (error) return setError(error.message);
    setStatus("off");
  }

  if (status === "loading") return <Spinner className="text-muted" />;

  if (status === "on")
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[15px] text-accent">
          <Icon name="shieldCheck" /> เปิดใช้งานแล้ว
        </div>
        <button type="button" onClick={disable} className="btn-ghost text-danger">
          ปิด 2FA
        </button>
        <ErrorText>{error}</ErrorText>
      </div>
    );

  if (status === "enrolling")
    return (
      <form onSubmit={verify} className="flex flex-col gap-3">
        <p className="m-0 text-sm leading-relaxed text-ink-2">
          สแกน QR ด้วยแอป Authenticator (เช่น Google Authenticator, 2FAS, Aegis) แล้วใส่รหัส 6 หลัก
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR code สำหรับตั้งค่า 2FA" className="mx-auto h-48 w-48 rounded-xl border border-line bg-white p-2" />
        <p className="m-0 break-all text-center font-mono text-xs text-muted">{secret}</p>
        <Field label="รหัส 6 หลัก" id="enroll-code">
          <input
            id="enroll-code"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="field text-center font-mono text-xl tracking-[0.3em]"
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={busy || code.length !== 6} className="btn-primary">
          {busy ? <Spinner /> : "ยืนยันและเปิด 2FA"}
        </button>
      </form>
    );

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm leading-relaxed text-ink-2">
        ยังไม่ได้เปิด แนะนำให้เปิด เพื่อให้คนที่รู้รหัสบัญชีของคุณก็ยังดึงข้อมูลไม่ได้
      </p>
      <ErrorText>{error}</ErrorText>
      <button type="button" onClick={start} disabled={busy} className="btn-primary">
        {busy ? <Spinner /> : "เปิด 2FA"}
      </button>
    </div>
  );
}

function ChangeMaster({ meta, onChanged }: { meta: VaultMeta; onChanged: (m: VaultMeta) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setDone(false);
    if (next.length < 12 || estimateStrength(next).score < 3) return setError("Master password ใหม่ต้องยาว 12 ตัวขึ้นไปและเดายาก");
    if (next !== confirmPw) return setError("ยืนยันรหัสใหม่ไม่ตรงกัน");
    setBusy(true);
    try {
      onChanged(await changeMasterPassword(meta, current, next));
      setCurrent("");
      setNext("");
      setConfirmPw("");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปลี่ยนไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="Master password ปัจจุบัน" id="cur-master">
        <SecretInput id="cur-master" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </Field>
      <Field label="Master password ใหม่" id="next-master">
        <SecretInput id="next-master" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      </Field>
      <StrengthMeter password={next} />
      <Field label="ยืนยันรหัสใหม่" id="confirm-next">
        <SecretInput id="confirm-next" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" />
      </Field>
      <ErrorText>{error}</ErrorText>
      {done ? <p className="m-0 text-sm text-accent">เปลี่ยน Master password แล้ว</p> : null}
      <button type="submit" disabled={busy || !current} className="btn-ghost">
        {busy ? <Spinner /> : "เปลี่ยน Master password"}
      </button>
    </form>
  );
}

export function SettingsPanel({
  meta,
  email,
  lockMinutes,
  onLockMinutes,
  onMetaChanged,
  onLock,
  onClose,
}: {
  meta: VaultMeta;
  email: string;
  lockMinutes: number;
  onLockMinutes: (m: number) => void;
  onMetaChanged: (m: VaultMeta) => void;
  onLock: () => void;
  onClose: () => void;
}) {
  const [exporting, setExporting] = useState(false);

  async function exportBackup() {
    setExporting(true);
    try {
      const blob = await exportEncryptedBackup();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `vault-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[460px] flex-col overflow-y-auto bg-ground"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-ground px-5 py-3">
          <h1 id="settings-title" className="m-0 text-xl font-bold">
            ตั้งค่า
          </h1>
          <button type="button" onClick={onClose} aria-label="ปิด" className="icon-btn">
            <Icon name="close" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <div className="text-sm text-muted">บัญชี: {email}</div>

          <Section title="ยืนยันตัวตน 2 ขั้นตอน (2FA)">
            <TwoFactor />
          </Section>

          <Section title="ล็อกอัตโนมัติ">
            <label htmlFor="lock-min" className="text-sm text-ink-2">
              ล็อกคลังเมื่อไม่มีการใช้งาน
            </label>
            <select
              id="lock-min"
              value={lockMinutes}
              onChange={(e) => onLockMinutes(Number(e.target.value))}
              className="field"
            >
              {[1, 2, 5, 10, 15, 30].map((m) => (
                <option key={m} value={m}>
                  {m} นาที
                </option>
              ))}
            </select>
          </Section>

          <Section title="Master password">
            <ChangeMaster meta={meta} onChanged={onMetaChanged} />
            <p className="m-0 text-xs leading-relaxed text-muted">Recovery code เดิมยังใช้ได้หลังเปลี่ยนรหัส</p>
          </Section>

          <Section title="สำรองข้อมูล">
            <p className="m-0 text-sm leading-relaxed text-ink-2">
              ดาวน์โหลดไฟล์ที่ยังเข้ารหัสอยู่ เก็บไว้นอกเครื่องได้อย่างปลอดภัย (ต้องใช้ Master password หรือ Recovery code เพื่อเปิด)
            </p>
            <button type="button" onClick={exportBackup} disabled={exporting} className="btn-ghost">
              {exporting ? <Spinner /> : <Icon name="download" size={18} />} ดาวน์โหลดไฟล์สำรอง
            </button>
          </Section>

          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={onLock} className="btn-ghost">
              <Icon name="lock" size={18} /> ล็อกคลัง
            </button>
            <button type="button" onClick={() => getSupabase().auth.signOut()} className="btn-ghost text-danger">
              <Icon name="logout" size={18} /> ออกจากระบบ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
