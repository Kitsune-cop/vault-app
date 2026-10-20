# ห้องนิรภัย — ระบบเก็บรหัสผ่านส่วนตัว

Next.js + Supabase ที่เข้ารหัสทุกอย่างใน browser ก่อนส่งขึ้นเซิร์ฟเวอร์ (zero-knowledge)
Supabase และ Vercel เห็นแค่ข้อมูลที่เข้ารหัสแล้วเท่านั้น

## ฟีเจอร์

- ล็อกอินด้วย Supabase Auth + 2FA (TOTP) เปิด/ปิดได้ในหน้าตั้งค่า
- Master password → Argon2id → ปลดล็อกกุญแจคลัง (AES-256-GCM)
- Recovery code สำหรับกู้คืนเมื่อลืม Master password และเปลี่ยน Master password ได้
- เก็บ 3 ประเภท: ล็อกอิน, บัตร, โน้ตลับ พร้อมโฟลเดอร์และรายการโปรด
- ตัวสร้างรหัสผ่าน, แถบความแข็งแรง, ตรวจรหัสซ้ำ/รหัสอ่อน
- สร้างรหัส 2FA (TOTP) ของเว็บอื่นๆ ให้ในตัว
- ล็อกอัตโนมัติเมื่อไม่ได้ใช้งาน, ล้างคลิปบอร์ดหลังคัดลอก 30 วินาที
- ดาวน์โหลดไฟล์สำรองแบบที่ยังเข้ารหัสอยู่
- หน้าจอมือถือ และ Desktop แบบ 3 คอลัมน์

## โครงสร้างกุญแจ

```
Master password ──Argon2id (64 MiB, 3 รอบ)──▶ masterKey ─┐
                                                          ├─ ห่อ vaultKey (สุ่ม 256-bit)
Recovery code (160-bit) ──SHA-256──▶ recoveryKey ────────┘
vaultKey ──AES-256-GCM (AAD = id ของรายการ)──▶ แต่ละรายการ
```

## วิธีติดตั้ง

### 1. สร้างโปรเจกต์ Supabase

1. สมัครที่ [supabase.com](https://supabase.com) แล้วกด New project
2. ไปที่ **SQL Editor** วางเนื้อหาจาก `supabase/schema.sql` แล้วกด Run
3. ไปที่ **Project Settings → API** คัดลอก `Project URL` และ `anon` (publishable) key

### 2. รันบนเครื่อง

```bash
npm install
cp .env.example .env.local   # แล้วใส่ URL และ anon key
npm run dev
```

เปิด http://localhost:3000 → สร้างบัญชีแรก → ตั้ง Master password → **เก็บ Recovery code ไว้ให้ดี**

### 3. Deploy ฟรีบน Vercel (ได้ `https://ชื่อ.vercel.app`)

1. push โค้ดขึ้น GitHub (repo แบบ private)
2. ที่ [vercel.com](https://vercel.com) กด **Add New → Project** แล้วเลือก repo
3. ใส่ Environment Variables `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. กด Deploy

### 4. ทำทันทีหลัง deploy (สำคัญ)

- [ ] Supabase → **Authentication → Sign In / Providers** → ปิด **Allow new users to sign up**
- [ ] Supabase → **Authentication → URL Configuration** → ตั้ง Site URL เป็น URL ของ Vercel
- [ ] ในแอป: **ตั้งค่า → เปิด 2FA**
- [ ] หลังเปิด 2FA แล้ว รันส่วน "บังคับ 2FA" ท้ายไฟล์ `schema.sql` (เอา `--` ออก)
- [ ] พิมพ์ Recovery code เก็บไว้ในที่ปลอดภัย
- [ ] ดาวน์โหลดไฟล์สำรองเป็นระยะ (ตั้งค่า → สำรองข้อมูล)

## ข้อควรรู้

- **ลืม Master password และทำ Recovery code หาย = ข้อมูลหายถาวร** ไม่มีใครกู้ให้ได้
- โปรเจกต์ Supabase แบบฟรีจะถูกพักถ้าไม่มีการใช้งานนานราว 1 สัปดาห์ กด Restore ในแดชบอร์ดได้ ข้อมูลไม่หาย
- ห้ามใส่ `service_role` key ในโปรเจกต์นี้ ใช้แค่ anon key (RLS ป้องกันให้แล้ว)
- การเข้ารหัสทั้งหมดอยู่ใน Client Component อย่าย้ายไปทำใน Server Action / API route
- `connect-src` ใน CSP จะล็อกไว้ที่ Supabase URL ของคุณตอน build (ตั้ง env ก่อน build)

## โครงสร้างไฟล์

```
app/              layout, หน้าแรก, globals.css (สี/ฟอนต์)
components/
  VaultApp.tsx      ลำดับหน้าจอ login → 2FA → ปลดล็อก → คลัง
  AuthScreens.tsx   เข้าสู่ระบบ, 2FA, ตั้ง/ปลดล็อก Master, Recovery
  VaultScreen.tsx   รายการ, ค้นหา, ตัวกรอง, layout มือถือ/desktop
  ItemDetail.tsx    รายละเอียด + TOTP + คัดลอก
  ItemEditor.tsx    เพิ่ม/แก้ไข + ตัวสร้างรหัส
  SettingsPanel.tsx 2FA, ล็อกอัตโนมัติ, เปลี่ยน Master, สำรองข้อมูล
lib/
  crypto.ts         Argon2id, AES-GCM, Recovery code
  vault.ts          อ่าน/เขียน Supabase (เฉพาะ ciphertext)
  totp.ts           สร้างรหัส TOTP (RFC 6238)
  generator.ts      สุ่มรหัสผ่าน + ประเมินความแข็งแรง
supabase/schema.sql ตาราง + RLS
next.config.ts      Security headers (CSP, HSTS, ...)
```
