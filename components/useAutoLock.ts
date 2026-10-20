"use client";

import { useEffect, useRef, useState } from "react";

const EVENTS = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"] as const;

/** ล็อกคลังเมื่อไม่มีการใช้งานครบ `minutes` นาที คืนค่าวินาทีที่เหลือ */
export function useAutoLock(minutes: number, onLock: () => void): number {
  const deadline = useRef(Date.now() + minutes * 60_000);
  const [remaining, setRemaining] = useState(minutes * 60);
  const lockRef = useRef(onLock);
  lockRef.current = onLock;

  useEffect(() => {
    const reset = () => {
      deadline.current = Date.now() + minutes * 60_000;
    };
    reset();
    EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    const tick = setInterval(() => {
      const left = Math.max(0, Math.round((deadline.current - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) lockRef.current();
    }, 1000);
    return () => {
      clearInterval(tick);
      EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes]);

  return remaining;
}

export function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
