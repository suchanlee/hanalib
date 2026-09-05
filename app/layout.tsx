import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: '하나의씨앗 도서관 · Hana Library',
  description: 'A private community library for sharing books.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: '/favicon.svg',
    apple: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
  applicationName: '하나의씨앗 도서관',
  appleWebApp: {
    capable: true,
    title: '하나의씨앗 도서관',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#215e4a',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${geistSans.variable} antialiased`}>{children}</body>
    </html>
  );
}
