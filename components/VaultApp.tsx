"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { fetchMeta, type VaultMeta } from "@/lib/vault";
import { LoginScreen, MfaScreen, RecoveryCodeScreen, SetupScreen, UnlockScreen } from "./AuthScreens";
import { Spinner } from "./ui";
import { VaultScreen } from "./VaultScreen";

type Stage =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "login" }
  | { name: "mfa"; factorId: string }
  | { name: "setup" }
  | { name: "recovery-code"; code: string; key: CryptoKey; meta: VaultMeta }
  | { name: "locked"; meta: VaultMeta }
  | { name: "vault"; key: CryptoKey; meta: VaultMeta };

/**
 * ตัวควบคุมลำดับหน้าจอ:
 * login → (2FA) → setup | locked → vault
 * กุญแจ (CryptoKey) อยู่ใน memory เท่านั้น ไม่เคยถูกเขียนลง storage
 */
export default function VaultApp() {
  const [stage, setStage] = useState<Stage>({ name: "loading" });
  const [email, setEmail] = useState("");
  const routing = useRef(false);

  const route = useCallback(async () => {
    if (routing.current) return;
    routing.current = true;
    try {
      const sb = getSupabase();
      const { data } = await sb.auth.getSession();
      if (!data.session) return setStage({ name: "login" });
      setEmail(data.session.user.email ?? "");

      const aal = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal.data && aal.data.nextLevel === "aal2" && aal.data.currentLevel !== "aal2") {
        const { data: factors } = await sb.auth.mfa.listFactors();
        const totp = factors?.totp?.find((f) => f.status === "verified");
        if (totp) return setStage({ name: "mfa", factorId: totp.id });
      }

      const meta = await fetchMeta();
      setStage(meta ? { name: "locked", meta } : { name: "setup" });
    } catch (e) {
      setStage({ name: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      routing.current = false;
    }
  }, []);

  useEffect(() => {
    route();
    let sub: { unsubscribe: () => void } | undefined;
    try {
      sub = getSupabase().auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          setEmail("");
          setStage({ name: "login" });
        }
      }).data.subscription;
    } catch {
      /* config error already shown by route() */
    }
    return () => sub?.unsubscribe();
  }, [route]);

  const lock = useCallback(() => {
    setStage((s) => (s.name === "vault" ? { name: "locked", meta: s.meta } : s));
  }, []);

  switch (stage.name) {
    case "loading":
      return (
        <main className="flex min-h-dvh items-center justify-center text-muted">
          <Spinner />
        </main>
      );
    case "error":
      return (
        <main className="flex min-h-dvh items-center justify-center p-6">
          <div className="flex max-w-md flex-col gap-3 rounded-2xl border border-line bg-surface p-6">
            <h1 className="m-0 text-xl font-bold">เชื่อมต่อไม่สำเร็จ</h1>
            <p className="m-0 text-sm leading-relaxed text-ink-2">{stage.message}</p>
            <button type="button" className="btn-ghost" onClick={() => location.reload()}>
              ลองใหม่
            </button>
          </div>
        </main>
      );
    case "login":
      return <LoginScreen onSignedIn={route} />;
    case "mfa":
      return <MfaScreen factorId={stage.factorId} onVerified={route} />;
    case "setup":
      return (
        <SetupScreen
          onCreated={(key, meta, code) => setStage({ name: "recovery-code", code, key, meta })}
        />
      );
    case "recovery-code":
      return (
        <RecoveryCodeScreen
          code={stage.code}
          onDone={() => setStage({ name: "vault", key: stage.key, meta: stage.meta })}
        />
      );
    case "locked":
      return (
        <UnlockScreen
          meta={stage.meta}
          email={email}
          onUnlocked={(key, meta) => setStage({ name: "vault", key, meta })}
        />
      );
    case "vault":
      return (
        <VaultScreen
          vaultKey={stage.key}
          meta={stage.meta}
          email={email}
          onLock={lock}
          onMetaChanged={(meta) => setStage({ name: "vault", key: stage.key, meta })}
        />
      );
  }
}
