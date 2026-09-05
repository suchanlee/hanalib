import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import { ThemeProvider } from '@/features/app/theme-context';
import './globals.css';
import { AppErrorBoundary } from '@/features/app/app-error-boundary';

const themeInitializer = `
  (() => {
    try {
      const stored = localStorage.getItem('hana-theme');
      const theme = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
      const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    } catch {}
  })();
`;

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: '씨앗책장 · Hana Seed Books',
  description: 'A private community library for sharing books.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/seed-logo.svg', type: 'image/svg+xml' }],
    shortcut: '/seed-logo.svg',
    apple: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
  applicationName: '씨앗책장',
  appleWebApp: {
    capable: true,
    title: '씨앗책장',
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
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializer }} />
      </head>
      <body className={`${geistSans.variable} antialiased`}>
        <AppErrorBoundary><ThemeProvider>{children}</ThemeProvider></AppErrorBoundary>
      </body>
    </html>
  );
}
