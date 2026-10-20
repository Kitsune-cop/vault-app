"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { estimateStrength } from "@/lib/generator";
import { deleteItem, listItems, saveItem, type VaultItem, type VaultItemData, type VaultMeta } from "@/lib/vault";
import { Icon, type IconName } from "./Icons";
import { ItemDetail } from "./ItemDetail";
import { ItemEditor } from "./ItemEditor";
import { SettingsPanel } from "./SettingsPanel";
import { formatCountdown, useAutoLock } from "./useAutoLock";
import { Toast, useClipboard } from "./useClipboard";
import { ItemTile, LogoMark, Spinner } from "./ui";

type Filter = "all" | "favorite" | "login" | "card" | "note" | "health" | `folder:${string}`;
type Mode = "view" | "edit" | "new";

const LOCK_KEY = "vault.lockMinutes";

function readLockMinutes(): number {
  try {
    const v = Number(localStorage.getItem(LOCK_KEY));
    return v > 0 ? v : 5;
  } catch {
    return 5;
  }
}

function secretOf(item: VaultItem): string {
  return item.type === "card" ? item.cardNumber : item.type === "login" ? item.password : "";
}

function subtitleOf(item: VaultItem): string {
  if (item.type === "card") return item.cardNumber ? `•••• ${item.cardNumber.replace(/\s/g, "").slice(-4)}` : "บัตร";
  if (item.type === "note") return "โน้ตลับ";
  return item.username || item.url || "—";
}

export function VaultScreen({
  vaultKey,
  meta,
  email,
  onLock,
  onMetaChanged,
}: {
  vaultKey: CryptoKey;
  meta: VaultMeta;
  email: string;
  onLock: () => void;
  onMetaChanged: (m: VaultMeta) => void;
}) {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [broken, setBroken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lockMinutes, setLockMinutes] = useState(5);
  const { copy, toast, setToast } = useClipboard();

  useEffect(() => setLockMinutes(readLockMinutes()), []);
  const remaining = useAutoLock(lockMinutes, onLock);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const r = await listItems(vaultKey);
      setItems(r.items);
      setBroken(r.broken);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [vaultKey]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- derived ----------
  const { duplicateIds, weakIds } = useMemo(() => {
    const byPw = new Map<string, string[]>();
    const weak = new Set<string>();
    for (const it of items) {
      if (it.type !== "login" || !it.password) continue;
      byPw.set(it.password, [...(byPw.get(it.password) ?? []), it.id]);
      if (estimateStrength(it.password).score < 3) weak.add(it.id);
    }
    const dup = new Set<string>();
    byPw.forEach((ids) => ids.length > 1 && ids.forEach((id) => dup.add(id)));
    return { duplicateIds: dup, weakIds: weak };
  }, [items]);

  const folders = useMemo(
    () => [...new Set(items.map((i) => i.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th")),
    [items],
  );

  const counts = useMemo(
    () => ({
      all: items.length,
      favorite: items.filter((i) => i.favorite).length,
      login: items.filter((i) => i.type === "login").length,
      card: items.filter((i) => i.type === "card").length,
      note: items.filter((i) => i.type === "note").length,
      health: new Set([...duplicateIds, ...weakIds]).size,
    }),
    [items, duplicateIds, weakIds],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => {
        if (filter === "favorite" && !i.favorite) return false;
        if ((filter === "login" || filter === "card" || filter === "note") && i.type !== filter) return false;
        if (filter === "health" && !duplicateIds.has(i.id) && !weakIds.has(i.id)) return false;
        if (filter.startsWith("folder:") && i.folder !== filter.slice(7)) return false;
        if (!q) return true;
        return [i.name, i.url, i.username, i.folder].some((f) => f.toLowerCase().includes(q));
      })
      .sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [items, filter, query, duplicateIds, weakIds]);

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const panelOpen = mode !== "view" || selected !== null;

  // ---------- actions ----------
  async function handleSave(data: VaultItemData) {
    const id = mode === "edit" && selected ? selected.id : undefined;
    const saved = await saveItem(vaultKey, data, id);
    setItems((prev) => [...prev.filter((i) => i.id !== saved.id), saved]);
    setSelectedId(saved.id);
    setMode("view");
    setToast("บันทึกแล้ว");
  }

  async function handleDelete(item: VaultItem) {
    try {
      await deleteItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setSelectedId(null);
      setToast("ลบแล้ว");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  async function toggleFavorite(item: VaultItem) {
    const { id, createdAt, updatedAt, ...data } = item;
    void createdAt;
    void updatedAt;
    const saved = await saveItem(vaultKey, { ...data, favorite: !item.favorite }, id);
    setItems((prev) => prev.map((i) => (i.id === id ? saved : i)));
  }

  function openNew() {
    setSelectedId(null);
    setMode("new");
  }

  function changeLockMinutes(m: number) {
    setLockMinutes(m);
    try {
      localStorage.setItem(LOCK_KEY, String(m));
    } catch {}
  }

  const navItems: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "ทั้งหมด", count: counts.all },
    { id: "favorite", label: "รายการโปรด", count: counts.favorite },
    { id: "login", label: "ล็อกอิน", count: counts.login },
    { id: "card", label: "บัตร", count: counts.card },
    { id: "note", label: "โน้ตลับ", count: counts.note },
  ];

  const filterTitle =
    filter === "health"
      ? "ตรวจสุขภาพรหัส"
      : filter.startsWith("folder:")
        ? filter.slice(7)
        : navItems.find((n) => n.id === filter)?.label ?? "คลังของฉัน";

  // ---------- render ----------
  return (
    <div className="min-h-dvh bg-ground lg:grid lg:h-dvh lg:grid-cols-[240px_minmax(320px,380px)_1fr] lg:overflow-hidden">
      {/* Sidebar (desktop) */}
      <aside className="hidden flex-col gap-6 overflow-y-auto bg-night px-4 py-6 text-[#d5d9df] lg:flex">
        <div className="flex items-center gap-2.5 px-2">
          <LogoMark size={36} />
          <div className="text-[17px] font-semibold text-white">ห้องนิรภัย</div>
        </div>
        <nav className="flex flex-col gap-0.5 text-[15px]" aria-label="ตัวกรอง">
          {navItems.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setFilter(n.id)}
              aria-current={filter === n.id ? "page" : undefined}
              className={`flex min-h-11 items-center justify-between rounded-[10px] px-3 text-left ${
                filter === n.id ? "bg-[#262a32] font-medium text-white" : "hover:bg-[#1e2128]"
              }`}
            >
              {n.label}
              <span className="text-[13px] text-[#8e95a0]">{n.count}</span>
            </button>
          ))}
        </nav>
        {folders.length ? (
          <div className="flex flex-col gap-0.5 text-[15px]">
            <div className="px-3 pb-1.5 text-xs font-semibold tracking-wide text-[#8e95a0]">โฟลเดอร์</div>
            {folders.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(`folder:${f}`)}
                aria-current={filter === `folder:${f}` ? "page" : undefined}
                className={`flex min-h-10 items-center rounded-[10px] px-3 text-left ${
                  filter === `folder:${f}` ? "bg-[#262a32] text-white" : "hover:bg-[#1e2128]"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex-1" />
        <div className="flex flex-col gap-2 rounded-xl border border-night-line p-3">
          <div className="text-[13px] text-[#b4bac4]">ตรวจสุขภาพรหัสผ่าน</div>
          <div className="text-sm text-white">
            รหัสซ้ำ {duplicateIds.size} · อ่อน {weakIds.size}
          </div>
          <button type="button" onClick={() => setFilter("health")} className="text-left text-[13px] text-mint hover:underline">
            ดูรายการที่ต้องแก้
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-night-line text-sm text-white hover:bg-[#1e2128]"
          >
            <Icon name="gear" size={18} /> ตั้งค่า
          </button>
          <button
            type="button"
            onClick={onLock}
            className="flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-night-line text-sm text-white hover:bg-[#1e2128]"
          >
            <Icon name="lock" size={18} /> ล็อกคลัง · {formatCountdown(remaining)}
          </button>
        </div>
      </aside>

      {/* List */}
      <section
        className={`${panelOpen ? "hidden lg:flex" : "flex"} min-h-dvh flex-col lg:min-h-0 lg:overflow-hidden lg:border-r lg:border-line`}
      >
        <div className="flex flex-col gap-4 px-5 pb-3 pt-8 lg:px-4 lg:pt-6">
          <div className="flex items-center justify-between lg:hidden">
            <div className="flex flex-col gap-0.5">
              <h1 className="m-0 text-[26px] font-bold">{filterTitle}</h1>
              <div className="text-[13px] text-muted">
                {items.length} รายการ · ล็อกอัตโนมัติใน {formatCountdown(remaining)}
              </div>
            </div>
            <button type="button" onClick={onLock} aria-label="ล็อกคลังตอนนี้" className="flex h-11 w-11 items-center justify-center rounded-xl bg-night text-white">
              <Icon name="lock" />
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex h-12 flex-1 items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 text-muted focus-within:border-accent lg:h-11">
              <Icon name="search" />
              <input
                type="search"
                aria-label="ค้นหา"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาชื่อ เว็บไซต์ หรือ username"
                className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none"
              />
            </div>
            <button type="button" onClick={openNew} aria-label="เพิ่มรายการ" className="hidden h-11 w-11 flex-none items-center justify-center rounded-xl bg-accent text-white hover:bg-accent-hover lg:flex">
              <Icon name="plus" strokeWidth={2} />
            </button>
          </div>

          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 lg:hidden">
            {[...navItems, ...folders.map((f) => ({ id: `folder:${f}` as Filter, label: f, count: 0 }))].map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setFilter(n.id)}
                aria-pressed={filter === n.id}
                className={`h-9 flex-none rounded-full px-3.5 text-sm ${
                  filter === n.id ? "bg-night text-white" : "border border-line-strong bg-surface text-ink"
                }`}
              >
                {n.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2 px-5 pb-32 pt-1 lg:gap-1 lg:overflow-y-auto lg:px-4 lg:pb-6">
          {broken ? (
            <div className="rounded-xl bg-warn-soft p-3 text-sm text-warn">มี {broken} รายการที่ถอดรหัสไม่ได้ (ข้อมูลอาจเสียหาย)</div>
          ) : null}
          {loading ? (
            <div className="flex justify-center py-16 text-muted">
              <Spinner />
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-danger">
              {loadError}
              <button type="button" onClick={load} className="btn-ghost">
                ลองอีกครั้ง
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <div className="text-[15px] text-muted">
                {items.length === 0 ? "คลังยังว่างอยู่ เริ่มเพิ่มรหัสผ่านแรกได้เลย" : "ไม่พบรายการที่ตรงกัน"}
              </div>
              {items.length === 0 ? (
                <button type="button" onClick={openNew} className="btn-primary">
                  <Icon name="plus" /> เพิ่มรายการแรก
                </button>
              ) : null}
            </div>
          ) : (
            visible.map((item) => {
              const active = item.id === selectedId;
              const secret = secretOf(item);
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-1 rounded-[14px] border py-1.5 pl-3 pr-1.5 ${
                    active ? "border-accent bg-surface" : "border-line bg-surface lg:border-transparent lg:bg-transparent lg:hover:bg-surface"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(item.id);
                      setMode("view");
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 py-1.5 text-left"
                  >
                    <ItemTile name={item.name} type={item.type} />
                    <div className="flex min-w-0 flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[15px] font-semibold">{item.name || "(ไม่มีชื่อ)"}</span>
                        {item.favorite ? <Icon name="star" size={14} filled className="flex-none text-[#b45309]" /> : null}
                        {duplicateIds.has(item.id) ? (
                          <span className="flex-none rounded-md bg-[#fde4e8] px-1.5 text-[11px] font-semibold text-[#9f1239]">รหัสซ้ำ</span>
                        ) : weakIds.has(item.id) ? (
                          <span className="flex-none rounded-md bg-warn-soft px-1.5 text-[11px] font-semibold text-warn">อ่อน</span>
                        ) : null}
                      </div>
                      <span className="truncate text-[13px] text-muted">{subtitleOf(item)}</span>
                    </div>
                  </button>
                  {secret ? (
                    <button
                      type="button"
                      onClick={() => copy(secret, item.type === "card" ? "เลขบัตร" : "รหัสผ่าน")}
                      aria-label={`คัดลอกรหัสของ ${item.name}`}
                      className="icon-btn bg-accent-soft text-accent hover:bg-[#d3e9e4]"
                    >
                      <Icon name="copy" />
                    </button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        {/* Mobile FAB + bottom nav */}
        <button
          type="button"
          onClick={openNew}
          className="fixed bottom-[100px] right-5 z-20 flex h-14 items-center gap-2 rounded-2xl bg-accent px-5 text-base font-semibold text-white shadow-[0_8px_24px_rgba(14,107,94,0.28)] lg:hidden"
        >
          <Icon name="plus" strokeWidth={2} /> เพิ่ม
        </button>
        <nav className="fixed inset-x-0 bottom-0 z-20 flex h-20 border-t border-line bg-surface px-3 pb-4 pt-2 lg:hidden" aria-label="เมนูหลัก">
          {(
            [
              { label: "คลัง", icon: "shield", active: filter !== "health", onClick: () => setFilter("all") },
              { label: "สร้างรหัส", icon: "key", active: false, onClick: openNew },
              { label: "ตรวจสุขภาพ", icon: "shieldCheck", active: filter === "health", onClick: () => setFilter("health") },
              { label: "ตั้งค่า", icon: "gear", active: false, onClick: () => setSettingsOpen(true) },
            ] as { label: string; icon: IconName; active: boolean; onClick: () => void }[]
          ).map((n) => (
            <button
              key={n.label}
              type="button"
              onClick={n.onClick}
              className={`flex flex-1 flex-col items-center justify-center gap-1 text-xs ${n.active ? "font-semibold text-accent" : "text-muted"}`}
            >
              <Icon name={n.icon} size={22} />
              {n.label}
            </button>
          ))}
        </nav>
      </section>

      {/* Detail / editor */}
      <main className={`${panelOpen ? "block" : "hidden lg:block"} min-h-dvh lg:min-h-0 lg:overflow-y-auto`}>
        {mode === "new" ? (
          <ItemEditor key="new" isNew folders={folders} onSave={handleSave} onCancel={() => setMode("view")} />
        ) : mode === "edit" && selected ? (
          <ItemEditor
            key={selected.id}
            isNew={false}
            initial={selected}
            folders={folders}
            onSave={handleSave}
            onCancel={() => setMode("view")}
          />
        ) : selected ? (
          <ItemDetail
            key={selected.id}
            item={selected}
            copy={copy}
            duplicate={duplicateIds.has(selected.id)}
            onEdit={() => setMode("edit")}
            onDelete={() => handleDelete(selected)}
            onToggleFavorite={() => toggleFavorite(selected)}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div className="hidden h-full flex-col items-center justify-center gap-3 text-center text-muted lg:flex">
            <Icon name="lock" size={36} />
            <div className="text-[15px]">เลือกรายการทางซ้ายเพื่อดูรายละเอียด</div>
            <div className="text-[13px]">ถอดรหัสบนเครื่องนี้ · เซิร์ฟเวอร์เห็นแค่ข้อมูลที่เข้ารหัสแล้ว</div>
          </div>
        )}
      </main>

      {settingsOpen ? (
        <SettingsPanel
          meta={meta}
          email={email}
          lockMinutes={lockMinutes}
          onLockMinutes={changeLockMinutes}
          onMetaChanged={onMetaChanged}
          onLock={onLock}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      <Toast message={toast} />
    </div>
  );
}
