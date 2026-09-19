import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Down to the Stars",
  description: "Down to the Stars는 덱빌딩 탐험 게임입니다. 적을 쓰러뜨리고, 카드를 수집하세요. 발견한 덱에서 카드를 추출하고, 자신만의 덱을 만드세요. 여러 개의 덱을 준비하고 더 깊은 곳으로 내려가, 세계의 비밀을 밝혀내세요. 그 끝에서, 당신은 별에 닿을 수 있을까요?",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
