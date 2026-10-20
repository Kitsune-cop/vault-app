"use client";

import { useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";
import { estimateStrength } from "@/lib/generator";
import {
  WrongSecretError,
  createVault,
  recoverVault,
  unlockVault,
  type VaultMeta,
} from "@/lib/vault";
import { Icon } from "./Icons";
import { ErrorText, Field, LogoMark, SecretInput, Spinner, StrengthMeter } from "./ui";

const MIN_MASTER_LENGTH = 12;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "เกิดข้อผิดพลาด ลองอีกครั้ง";
}

/** ตรวจ Master password ใหม่ คืนข้อความ error หรือ null */
function validateNewMaster(pw: string, confirm: string): string | null {
  if (pw.length < MIN_MASTER_LENGTH) return `Master password ต้องยาวอย่างน้อย ${MIN_MASTER_LENGTH} ตัว`;
  if (estimateStrength(pw).score < 3) return "Master password ยังเดาง่ายเกินไป ลองใช้หลายคำต่อกันหรือเพิ่มความยาว";
  if (pw !== confirm) return "ยืนยัน Master password ไม่ตรงกัน";
  return null;
}

function LightShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh justify-center bg-ground px-6 pb-8 pt-16 sm:items-center sm:pt-8">
      <div className="flex w-full max-w-[400px] flex-col gap-8">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div className="text-lg font-semibold">ห้องนิรภัย</div>
        </div>
        {children}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------- Login
export function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    const sb = getSupabase();
    try {
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง" : error.message);
        onSignedIn();
      } else {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) onSignedIn();
        else setInfo("สมัครแล้ว เปิดอีเมลเพื่อกดยืนยัน จากนั้นกลับมาเข้าสู่ระบบ");
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <LightShell>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-3xl font-bold leading-snug">{mode === "signin" ? "เข้าสู่ระบบ" : "สร้างบัญชี"}</h1>
        <p className="m-0 text-[15px] leading-relaxed text-muted">
          ล็อกอินบัญชีเพื่อซิงก์คลังที่เข้ารหัสไว้ระหว่างอุปกรณ์ของคุณ
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="อีเมล" id="email">
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="field h-[52px]"
          />
        </Field>
        <Field label="รหัสผ่านบัญชี" id="account-password">
          <input
            id="account-password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field h-[52px]"
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        {info ? <p className="m-0 rounded-xl bg-accent-soft px-3.5 py-2.5 text-sm text-accent">{info}</p> : null}
        <button type="submit" disabled={busy} className="btn-primary mt-1 h-[52px]">
          {busy ? <Spinner /> : mode === "signin" ? "เข้าสู่ระบบ" : "สร้างบัญชี"}
        </button>
      </form>

      <div className="flex items-start gap-3 rounded-[14px] border border-line bg-surface p-4">
        <Icon name="phone" className="mt-0.5 flex-none text-accent" />
        <p className="m-0 text-sm leading-relaxed text-ink-2">
          ถ้าเปิด 2FA ไว้ ขั้นถัดไปจะขอรหัส 6 หลักจากแอป Authenticator
        </p>
      </div>

      <div className="flex flex-col gap-3 text-center">
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError("");
            setInfo("");
          }}
          className="mx-auto min-h-11 text-sm text-accent underline-offset-4 hover:underline"
        >
          {mode === "signin" ? "ยังไม่มีบัญชี? สร้างบัญชีแรก" : "มีบัญชีแล้ว? เข้าสู่ระบบ"}
        </button>
        <p className="m-0 text-[13px] leading-relaxed text-muted">
          รหัสนี้ใช้ยืนยันตัวตนเท่านั้น
          <br />
          ไม่ใช่ Master password ที่ใช้ถอดรหัสคลัง
        </p>
      </div>
    </LightShell>
  );
}

// ---------------------------------------------------------------- MFA
export function MfaScreen({ factorId, onVerified }: { factorId: string; onVerified: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await getSupabase().auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (error) {
      setError("รหัสไม่ถูกต้องหรือหมดเวลา ลองรหัสใหม่");
      setCode("");
      return;
    }
    onVerified();
  }

  return (
    <LightShell>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-3xl font-bold leading-snug">ยืนยัน 2 ขั้นตอน</h1>
        <p className="m-0 text-[15px] leading-relaxed text-muted">ใส่รหัส 6 หลักจากแอป Authenticator</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="รหัส 6 หลัก" id="otp">
          <input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="field h-14 text-center font-mono text-2xl tracking-[0.4em]"
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={busy || code.length !== 6} className="btn-primary h-[52px]">
          {busy ? <Spinner /> : "ยืนยัน"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => getSupabase().auth.signOut()}
        className="mx-auto min-h-11 text-sm text-muted hover:text-ink"
      >
        ออกจากระบบ
      </button>
    </LightShell>
  );
}

// ---------------------------------------------------------------- Setup master
export function SetupScreen({
  onCreated,
}: {
  onCreated: (key: CryptoKey, meta: VaultMeta, recoveryCode: string) => void;
}) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validateNewMaster(pw, confirm);
    if (problem) return setError(problem);
    setBusy(true);
    setError("");
    try {
      const { key, meta, recoveryCode } = await createVault(pw);
      onCreated(key, meta, recoveryCode);
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <LightShell>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-3xl font-bold leading-snug">ตั้ง Master password</h1>
        <p className="m-0 text-[15px] leading-relaxed text-muted">
          ใช้ถอดรหัสคลังบนเครื่องของคุณ จะไม่ถูกส่งขึ้นเซิร์ฟเวอร์ และเราจะกู้ให้ไม่ได้ถ้าลืม
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Master password" id="new-master" hint="แนะนำ: 4–5 คำสุ่มต่อกัน เช่น ม้า-แบตเตอรี่-ลวด-ถูกต้อง">
          <SecretInput id="new-master" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </Field>
        <StrengthMeter password={pw} />
        <Field label="ยืนยัน Master password" id="confirm-master">
          <SecretInput
            id="confirm-master"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={busy} className="btn-primary h-[52px]">
          {busy ? (
            <>
              <Spinner /> กำลังสร้างกุญแจ…
            </>
          ) : (
            "สร้างคลัง"
          )}
        </button>
      </form>
    </LightShell>
  );
}

// ---------------------------------------------------------------- Show recovery code
export function RecoveryCodeScreen({ code, onDone }: { code: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false);

  function download() {
    const blob = new Blob(
      [`Recovery code สำหรับห้องนิรภัย\n\n${code}\n\nเก็บไว้ในที่ปลอดภัย (พิมพ์ออกมา) แล้วลบไฟล์นี้ทิ้ง\n`],
      { type: "text/plain" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "vault-recovery-code.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <LightShell>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-3xl font-bold leading-snug">เก็บ Recovery code</h1>
        <p className="m-0 text-[15px] leading-relaxed text-muted">
          ถ้าลืม Master password นี่คือทางเดียวที่จะเปิดคลังได้ จะแสดงแค่ครั้งนี้ครั้งเดียว
        </p>
      </div>
      <div className="rounded-2xl border-[1.5px] border-accent bg-surface p-5">
        <p className="m-0 break-all text-center font-mono text-lg leading-loose tracking-wider select-all">{code}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="btn-ghost" onClick={() => navigator.clipboard.writeText(code)}>
          <Icon name="copy" size={18} /> คัดลอก
        </button>
        <button type="button" className="btn-ghost" onClick={download}>
          <Icon name="download" size={18} /> ดาวน์โหลด
        </button>
      </div>
      <label className="flex min-h-11 items-start gap-3 text-[15px] leading-relaxed">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-1 h-5 w-5 flex-none accent-[#0e6b5e]"
        />
        ฉันจดหรือพิมพ์ Recovery code เก็บไว้ในที่ปลอดภัยแล้ว
      </label>
      <button type="button" disabled={!saved} onClick={onDone} className="btn-primary h-[52px]">
        เข้าสู่คลัง
      </button>
    </LightShell>
  );
}

// ---------------------------------------------------------------- Unlock
export function UnlockScreen({
  meta,
  email,
  onUnlocked,
}: {
  meta: VaultMeta;
  email: string;
  onUnlocked: (key: CryptoKey, meta: VaultMeta) => void;
}) {
  const [mode, setMode] = useState<"unlock" | "recover">("unlock");
  const [master, setMaster] = useState("");
  const [code, setCode] = useState("");
  const [newMaster, setNewMaster] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "recover") {
      const problem = validateNewMaster(newMaster, confirm);
      if (problem) return setError(problem);
    }
    setBusy(true);
    try {
      if (mode === "unlock") {
        onUnlocked(await unlockVault(meta, master), meta);
      } else {
        const r = await recoverVault(meta, code, newMaster);
        onUnlocked(r.key, r.meta);
      }
    } catch (e) {
      setError(e instanceof WrongSecretError ? e.message : errMsg(e));
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh justify-center bg-night px-6 pb-8 pt-20 text-ground sm:items-center sm:pt-8">
      <form onSubmit={submit} className="flex w-full max-w-[400px] flex-col gap-7">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="flex h-[88px] w-[88px] items-center justify-center rounded-[28px] border border-night-line bg-night-2 text-mint">
            <Icon name="lock" size={40} strokeWidth={1.6} />
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="m-0 text-[28px] font-bold leading-snug">
              {mode === "unlock" ? "คลังถูกล็อกอยู่" : "กู้คืนด้วย Recovery code"}
            </h1>
            <p className="m-0 text-[15px] leading-relaxed text-[#b4bac4]">
              {mode === "unlock"
                ? "ใส่ Master password เพื่อถอดรหัสบนเครื่องนี้"
                : "ใส่ Recovery code แล้วตั้ง Master password ใหม่"}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-night-2 py-1.5 pl-1.5 pr-3.5 text-sm text-[#d5d9df]">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-white">
              {(email[0] ?? "?").toUpperCase()}
            </div>
            {email}
          </div>
        </div>

        {mode === "unlock" ? (
          <div className="mt-2 flex flex-col gap-2">
            <label htmlFor="master" className="text-sm font-medium text-[#d5d9df]">
              Master password
            </label>
            <SecretInput
              dark
              id="master"
              autoFocus
              autoComplete="current-password"
              value={master}
              onChange={(e) => setMaster(e.target.value)}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="rcode" className="text-sm font-medium text-[#d5d9df]">
                Recovery code
              </label>
              <input
                id="rcode"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="XXXX-XXXX-…"
                className="h-14 rounded-[14px] border-[1.5px] border-mint bg-[#1c1f26] px-4 font-mono uppercase tracking-wider text-ground outline-none"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="nmaster" className="text-sm font-medium text-[#d5d9df]">
                Master password ใหม่
              </label>
              <SecretInput dark id="nmaster" value={newMaster} onChange={(e) => setNewMaster(e.target.value)} autoComplete="new-password" />
              <StrengthMeter password={newMaster} dark />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="nconfirm" className="text-sm font-medium text-[#d5d9df]">
                ยืนยัน Master password ใหม่
              </label>
              <SecretInput dark id="nconfirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
        )}

        {error ? (
          <p role="alert" className="m-0 rounded-xl bg-[#3a1d1d] px-3.5 py-2.5 text-sm text-[#ffb4ab]">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy || (mode === "unlock" ? !master : !code)}
          className="flex h-14 items-center justify-center gap-2 rounded-[14px] bg-mint text-[17px] font-semibold text-[#0b2a25] disabled:opacity-50"
        >
          {busy ? (
            <>
              <Spinner /> กำลังถอดรหัส…
            </>
          ) : mode === "unlock" ? (
            "ปลดล็อก"
          ) : (
            "กู้คืนและตั้งรหัสใหม่"
          )}
        </button>

        <div className="flex gap-3 rounded-[14px] border border-night-line p-4">
          <Icon name="warn" className="mt-0.5 flex-none text-[#f2b65a]" />
          <p className="m-0 text-sm leading-relaxed text-[#d5d9df]">
            Master password ไม่เคยถูกส่งออกจากเครื่องนี้ ถ้าลืมจะกู้ข้อมูลได้ด้วย Recovery code เท่านั้น
          </p>
        </div>

        <div className="flex justify-between text-sm">
          <button
            type="button"
            onClick={() => {
              setMode(mode === "unlock" ? "recover" : "unlock");
              setError("");
            }}
            className="min-h-11 text-mint hover:underline"
          >
            {mode === "unlock" ? "ใช้ Recovery code" : "กลับไปใช้ Master password"}
          </button>
          <button
            type="button"
            onClick={() => getSupabase().auth.signOut()}
            className="min-h-11 text-[#b4bac4] hover:text-ground"
          >
            ออกจากระบบ
          </button>
        </div>
      </form>
    </main>
  );
}
