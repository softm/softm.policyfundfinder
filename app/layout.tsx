import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "지원한눈 — 내 사업에 맞는 정책자금 찾기",
  description: "기업마당 공식 공고를 검색하고 신청 준비를 관리하세요.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
