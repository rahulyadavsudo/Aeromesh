import type { Metadata, Viewport } from 'next';
import { DM_Sans, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-plus-jakarta',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'AeroMesh Flight & Transit — Microservices Flight Booking',
  description:
    'Polyglot microservices flight booking platform with luggage fare calculator, multi-currency checkout, offline maps, QR boarding passes, and real-time flight alerts.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.svg',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'AeroMesh Flight & Transit',
    description:
      'Low-bandwidth flight booking PWA with luggage fare engine, multi-currency payments, offline vector maps, and QR boarding passes.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'AeroMesh',
  },
};

export const viewport: Viewport = {
  themeColor: '#0F4C81',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${dmSans.variable} ${plusJakarta.variable} ${jetbrainsMono.variable}`}
    >
      <body className="bg-slate-50 text-slate-900 antialiased selection:bg-blue-700 selection:text-white dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
