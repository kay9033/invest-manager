import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Stock Pioneer",
  description: "AI投資アシスタント - 新高値銘柄のスクリーニングと売買判定",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className="dark">
      <body
        className={`${notoSansJP.className} bg-gray-950 text-gray-100 min-h-screen antialiased`}
      >
        <div className="max-w-7xl mx-auto px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
