"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const CLEAR_AFTER_MS = 30_000;

/** คัดลอกข้อความ แล้วล้างคลิปบอร์ดอัตโนมัติหลัง 30 วินาที */
export function useClipboard() {
  const [toast, setToast] = useState<string | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(async (text: string, label: string, secret = true) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setToast("คัดลอกไม่สำเร็จ เบราว์เซอร์ไม่อนุญาต");
      return;
    }
    if (clearTimer.current) clearTimeout(clearTimer.current);
    if (secret) {
      clearTimer.current = setTimeout(() => {
        navigator.clipboard.writeText("").catch(() => {});
      }, CLEAR_AFTER_MS);
    }
    setToast(secret ? `คัดลอก${label}แล้ว · ล้างคลิปบอร์ดใน 30 วินาที` : `คัดลอก${label}แล้ว`);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  return { copy, toast, setToast };
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 rounded-[14px] bg-night px-4 py-3.5 text-sm text-ground shadow-2xl lg:bottom-8"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7fd3c3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12l5 5 9-10" />
      </svg>
      <span>{message}</span>
    </div>
  );
}
