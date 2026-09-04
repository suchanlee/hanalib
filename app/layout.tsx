import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: '하나도서관 · Hana Library',
  description: 'A private community library for sharing books.',
  manifest: '/manifest.webmanifest',
  applicationName: '하나도서관',
  themeColor: '#215e4a',
  appleWebApp: {
    capable: true,
    title: '하나도서관',
    statusBarStyle: 'default',
  },
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
