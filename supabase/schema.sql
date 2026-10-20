-- ============================================================
-- Schema สำหรับระบบเก็บรหัสผ่าน (รันใน Supabase → SQL Editor)
-- เซิร์ฟเวอร์เก็บเฉพาะข้อมูลที่เข้ารหัสแล้วเท่านั้น
-- ============================================================

-- ข้อมูลกุญแจของคลัง (1 แถวต่อผู้ใช้)
create table if not exists public.vault_meta (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  kdf_salt text not null,
  kdf_params jsonb not null,
  wrapped_key jsonb not null,           -- vaultKey ที่ห่อด้วย Master password
  recovery_wrapped_key jsonb not null,  -- vaultKey ที่ห่อด้วย Recovery code
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- รายการรหัสผ่าน (เข้ารหัสทั้งก้อน รวมชื่อเว็บและ username)
create table if not exists public.vault_items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  iv text not null,
  ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vault_items_user_id_idx on public.vault_items (user_id);

-- อัปเดต updated_at อัตโนมัติ
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vault_meta_touch on public.vault_meta;
create trigger vault_meta_touch before update on public.vault_meta
  for each row execute function public.touch_updated_at();

drop trigger if exists vault_items_touch on public.vault_items;
create trigger vault_items_touch before update on public.vault_items
  for each row execute function public.touch_updated_at();

-- ---------- Row Level Security ----------
alter table public.vault_meta enable row level security;
alter table public.vault_items enable row level security;

revoke all on public.vault_meta from anon;
revoke all on public.vault_items from anon;

drop policy if exists "own meta" on public.vault_meta;
create policy "own meta" on public.vault_meta
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own items" on public.vault_items;
create policy "own items" on public.vault_items
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------- (แนะนำ) บังคับ 2FA ----------
-- รันส่วนนี้ "หลังจาก" เปิด 2FA ในหน้าตั้งค่าของแอปแล้วเท่านั้น
-- ไม่งั้นจะเข้าคลังตัวเองไม่ได้
--
-- create policy "require 2fa meta" on public.vault_meta
--   as restrictive for all to authenticated
--   using ((select auth.jwt() ->> 'aal') = 'aal2')
--   with check ((select auth.jwt() ->> 'aal') = 'aal2');
--
-- create policy "require 2fa items" on public.vault_items
--   as restrictive for all to authenticated
--   using ((select auth.jwt() ->> 'aal') = 'aal2')
--   with check ((select auth.jwt() ->> 'aal') = 'aal2');
