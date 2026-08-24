import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "marketvalley — 아이디어를 시장 반응으로",
  description:
    "아이디어 하나에서 검증 가설, 공개 랜딩, 캐러셀과 관심 응답까지 연결하는 시장검증 캠페인 도구",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
