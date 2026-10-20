"use client";

import { useEffect, useMemo, useState } from "react";
import { parseTotp, totpCode } from "@/lib/totp";
import type { VaultItem } from "@/lib/vault";
import { Icon } from "./Icons";
import { ItemTile, StrengthMeter } from "./ui";

type CopyFn = (text: string, label: string, secret?: boolean) => void;

const TYPE_LABEL = { login: "ล็อกอิน", card: "บัตร", note: "โน้ตลับ" } as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

function safeHref(url: string): string | null {
  if (!url) return null;
  const withScheme = /^[a-z]+:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function Row({
  label,
  children,
  actions,
  last = false,
}: {
  label: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center gap-1 py-3 pl-4 pr-2 ${last ? "" : "border-b border-[#eef0f2]"}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="text-xs text-muted">{label}</div>
        <div className="min-w-0 break-words text-base">{children}</div>
      </div>
      {actions}
    </div>
  );
}

function CopyButton({ onClick, label, strong = false }: { onClick: () => void; label: string; strong?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={strong ? "icon-btn bg-accent-soft text-accent hover:bg-[#d3e9e4]" : "icon-btn"}
    >
      <Icon name="copy" />
    </button>
  );
}

function TotpRow({ secret, copy }: { secret: string; copy: CopyFn }) {
  const cfg = useMemo(() => parseTotp(secret), [secret]);
  const [state, setState] = useState<{ code: string; remaining: number } | null>(null);

  useEffect(() => {
    if (!cfg) return;
    let alive = true;
    const run = () => totpCode(cfg).then((r) => alive && setState(r));
    run();
    const t = setInterval(run, 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [cfg]);

  if (!cfg) return <Row label="รหัส 2FA (TOTP)">รูปแบบ secret ไม่ถูกต้อง</Row>;
  const code = state?.code ?? "------";
  return (
    <Row
      label="รหัส 2FA (TOTP)"
      actions={
        <>
          <span className="px-1 font-mono text-[13px] text-muted">0:{String(state?.remaining ?? 0).padStart(2, "0")}</span>
          <CopyButton label="คัดลอกรหัส 2FA" onClick={() => copy(code, "รหัส 2FA")} />
        </>
      }
    >
      <span className="font-mono text-xl font-medium tracking-[0.2em]">
        {code.slice(0, Math.ceil(code.length / 2))} {code.slice(Math.ceil(code.length / 2))}
      </span>
    </Row>
  );
}

function SecretRow({ label, value, copy, strength = false }: { label: string; value: string; copy: CopyFn; strength?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-2.5 border-b border-[#eef0f2] py-3 pl-4 pr-2">
      <div className="flex items-center gap-1">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="text-xs text-muted">{label}</div>
          <div className="break-all font-mono text-[17px] tracking-wide">{show ? value : "•".repeat(Math.min(value.length, 16))}</div>
        </div>
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? "ซ่อน" : "แสดง"} className="icon-btn">
          <Icon name={show ? "eyeOff" : "eye"} />
        </button>
        <CopyButton strong label={`คัดลอก${label}`} onClick={() => copy(value, label)} />
      </div>
      {strength ? (
        <div className="pr-2">
          <StrengthMeter password={value} />
        </div>
      ) : null}
    </div>
  );
}

export function ItemDetail({
  item,
  copy,
  onEdit,
  onDelete,
  onToggleFavorite,
  onBack,
  duplicate,
}: {
  item: VaultItem;
  copy: CopyFn;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onBack: () => void;
  duplicate: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const href = safeHref(item.url);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 pb-2 pt-4 lg:hidden">
        <button type="button" onClick={onBack} aria-label="กลับ" className="icon-btn text-ink">
          <Icon name="back" size={22} strokeWidth={2} />
        </button>
      </div>

      <div className="flex flex-col gap-5 px-5 pb-8 lg:px-10 lg:pt-8">
        <div className="flex flex-wrap items-center gap-4">
          <ItemTile name={item.name} type={item.type} size={60} />
          <div className="flex min-w-[180px] flex-1 flex-col gap-0.5">
            <h1 className="m-0 text-2xl font-bold lg:text-[28px]">{item.name || "(ไม่มีชื่อ)"}</h1>
            <div className="text-sm text-muted">
              {TYPE_LABEL[item.type]}
              {item.folder ? ` · โฟลเดอร์ ${item.folder}` : ""}
            </div>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onToggleFavorite}
              aria-label={item.favorite ? "เอาออกจากรายการโปรด" : "เพิ่มในรายการโปรด"}
              aria-pressed={item.favorite}
              className={`icon-btn ${item.favorite ? "text-[#b45309]" : ""}`}
            >
              <Icon name="star" size={22} filled={item.favorite} />
            </button>
            <button type="button" onClick={onEdit} className="btn-ghost">
              แก้ไข
            </button>
          </div>
        </div>

        {duplicate ? (
          <div className="flex items-start gap-3 rounded-[14px] bg-warn-soft p-3.5 text-sm text-warn">
            <Icon name="warn" size={18} className="mt-0.5 flex-none" />
            รหัสผ่านนี้ถูกใช้ซ้ำกับรายการอื่น ควรเปลี่ยนเป็นรหัสที่ไม่ซ้ำ
          </div>
        ) : null}

        <div className="flex max-w-[720px] flex-col overflow-hidden rounded-2xl border border-line bg-surface">
          {item.type === "login" ? (
            <>
              {item.username ? (
                <Row
                  label="Username"
                  actions={<CopyButton label="คัดลอก username" onClick={() => copy(item.username, " username", false)} />}
                >
                  {item.username}
                </Row>
              ) : null}
              {item.password ? <SecretRow label="รหัสผ่าน" value={item.password} copy={copy} strength /> : null}
              {item.totp ? <TotpRow secret={item.totp} copy={copy} /> : null}
              <Row
                label="เว็บไซต์"
                last
                actions={
                  href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" aria-label="เปิดเว็บไซต์" className="icon-btn">
                      <Icon name="external" />
                    </a>
                  ) : null
                }
              >
                <span className={href ? "text-accent" : "text-muted"}>{item.url || "—"}</span>
              </Row>
            </>
          ) : null}

          {item.type === "card" ? (
            <>
              <Row label="ชื่อบนบัตร">{item.cardHolder || "—"}</Row>
              {item.cardNumber ? <SecretRow label="เลขบัตร" value={item.cardNumber} copy={copy} /> : null}
              <Row label="วันหมดอายุ">{item.cardExpiry || "—"}</Row>
              {item.cardCvv ? <SecretRow label="CVV" value={item.cardCvv} copy={copy} /> : null}
            </>
          ) : null}

          {item.type === "note" ? (
            <div className="whitespace-pre-wrap p-4 text-[15px] leading-relaxed">{item.notes || "—"}</div>
          ) : null}
        </div>

        {item.type !== "note" && item.notes ? (
          <div className="flex max-w-[720px] flex-col gap-1 rounded-2xl border border-line bg-surface px-4 py-3.5">
            <div className="text-xs text-muted">โน้ต</div>
            <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{item.notes}</div>
          </div>
        ) : null}

        <div className="px-1 text-xs leading-relaxed text-muted">
          แก้ไขล่าสุด {formatDate(item.updatedAt)} · สร้างเมื่อ {formatDate(item.createdAt)}
        </div>

        {confirmDelete ? (
          <div className="flex max-w-[720px] flex-col gap-3 rounded-2xl border border-[#f1c7c7] bg-surface p-4">
            <p className="m-0 text-[15px]">ลบ “{item.name}” ถาวร? กู้คืนไม่ได้</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmDelete(false)} className="btn-ghost flex-1">
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="flex h-11 flex-1 items-center justify-center rounded-xl bg-danger font-semibold text-white"
              >
                ลบเลย
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex h-12 max-w-[720px] items-center justify-center gap-2 rounded-xl border border-[#f1c7c7] bg-surface text-[15px] font-semibold text-danger"
          >
            <Icon name="trash" size={18} /> ลบรายการ
          </button>
        )}
      </div>
    </div>
  );
}
