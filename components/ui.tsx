"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { estimateStrength } from "@/lib/generator";
import { Icon } from "./Icons";

export function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string;
  id: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {hint ? <div className="text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

/** ช่องรหัสผ่านที่กดแสดง/ซ่อนได้ */
export function SecretInput({
  dark = false,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { dark?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div
      className={
        dark
          ? "flex h-14 items-center gap-2 rounded-[14px] border-[1.5px] border-mint bg-[#1c1f26] pl-4 pr-1.5"
          : "flex h-12 items-center gap-1 rounded-xl border border-line-strong bg-surface pl-4 pr-1 focus-within:border-accent"
      }
    >
      <input
        {...props}
        type={show ? "text" : "password"}
        autoComplete={props.autoComplete ?? "off"}
        spellCheck={false}
        className={`min-w-0 flex-1 bg-transparent font-mono outline-none ${
          dark ? "text-lg tracking-wider text-ground" : "text-base text-ink"
        } ${className}`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "ซ่อนรหัส" : "แสดงรหัส"}
        className={`flex h-11 w-11 flex-none items-center justify-center rounded-[10px] ${
          dark ? "text-[#b4bac4] hover:bg-night-2" : "text-ink-2 hover:bg-ground"
        }`}
      >
        <Icon name={show ? "eyeOff" : "eye"} />
      </button>
    </div>
  );
}

const BAR_COLORS = ["#b42318", "#c2410c", "#b45309", "#0f766e", "#0e6b5e"];

export function StrengthMeter({ password, dark = false }: { password: string; dark?: boolean }) {
  const s = estimateStrength(password);
  const color = BAR_COLORS[s.score];
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid flex-1 grid-cols-4 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[5px] rounded-full"
            style={{
              background: password && i < Math.max(s.score, 1) ? color : dark ? "#343944" : "#e4e6e9",
            }}
          />
        ))}
      </div>
      <div
        className="text-xs font-semibold"
        style={{ color: password ? (dark ? "#d5d9df" : color) : dark ? "#8e95a0" : "#5b6068" }}
      >
        {password ? `${s.label} · ${password.length} ตัว` : "ยังไม่ได้ใส่"}
      </div>
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="m-0 rounded-xl bg-[#fde8e6] px-3.5 py-2.5 text-sm text-danger">
      {children}
    </p>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
      aria-hidden="true"
    />
  );
}

export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl bg-accent text-white"
      style={{ width: size, height: size }}
    >
      <Icon name="shield" size={size * 0.55} />
    </div>
  );
}

const TILE_COLORS = ["#1f2328", "#c2410c", "#1d4ed8", "#7c3aed", "#b91c1c", "#0f766e", "#a16207", "#be185d"];

export function ItemTile({ name, type, size = 40 }: { name: string; type: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const bg = TILE_COLORS[h % TILE_COLORS.length];
  const initial = [...(name.trim() || "?")][0].toUpperCase();
  return (
    <div
      className="flex flex-none items-center justify-center font-semibold text-white"
      style={{ width: size, height: size, borderRadius: size * 0.26, background: bg, fontSize: size * 0.4 }}
      aria-hidden="true"
    >
      {type === "card" ? <Icon name="card" size={size * 0.5} /> : type === "note" ? <Icon name="note" size={size * 0.5} /> : initial}
    </div>
  );
}
