import type { Metadata, Viewport } from "next";
import { Gowun_Batang, Noto_Sans_KR, Playfair_Display, Song_Myung } from "next/font/google";
import "./globals.css";

const display = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display",
});

// Brush-stroke myeongjo for the hand-lettered accents.
const accent = Song_Myung({
  weight: "400",
  variable: "--font-accent",
});

const sans = Noto_Sans_KR({
  weight: ["400", "500", "700"],
  preload: false,
  variable: "--font-sans",
});

const serif = Gowun_Batang({
  weight: ["400", "700"],
  preload: false,
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "Crossroad · UTKCC Career Seminar 2026",
  description:
    "갈림길에서 — 선배님들이 마주했던 선택의 순간. 2026.11.21 (토) 오후 8시 EST, Zoom.",
};

export const viewport: Viewport = {
  themeColor: "#e6edf6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${display.variable} ${accent.variable} ${sans.variable} ${serif.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
