import type { Metadata, Viewport } from "next";
// ฟอนต์แบบ self-host (ไม่เรียก Google Fonts ตอนใช้งาน → ผ่าน CSP font-src 'self')
import "@fontsource/ibm-plex-sans-thai/400.css";
import "@fontsource/ibm-plex-sans-thai/500.css";
import "@fontsource/ibm-plex-sans-thai/600.css";
import "@fontsource/ibm-plex-sans-thai/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ห้องนิรภัย",
  description: "ที่เก็บรหัสผ่านส่วนตัว เข้ารหัสบนเครื่องก่อนบันทึก",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#15171C",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
