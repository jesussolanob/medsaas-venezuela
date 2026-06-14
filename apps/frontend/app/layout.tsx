import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

// 2026-05-02: Cambio de Geist → Plus Jakarta Sans / JetBrains Mono
// según el design system "Delta Health Tech" (handoff bundle).
// Plus Jakarta Sans para UI y display; JetBrains Mono solo para metadata
// (cédulas, IDs, fechas tabulares, números monoespaciados).
const jakarta = Plus_Jakarta_Sans({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
});

const jetbrains = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Delta Medical CRM — Plataforma médica para Venezuela',
  description:
    'El primer software de salud hecho en Venezuela. Gestiona pacientes, agenda, historial clínico y finanzas desde un solo lugar.',
  icons: {
    icon: '/logos/delta-iso-256.png',
    apple: '/logos/delta-iso-256.png',
  },
  openGraph: {
    title: 'Delta Medical CRM',
    description: 'La primera plataforma venezolana que conecta especialistas con pacientes.',
    type: 'website',
    locale: 'es_VE',
    images: [
      {
        url: '/logos/delta-iso-1024.png',
        width: 1024,
        height: 926,
        alt: 'Delta Health Tech',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Delta Medical CRM',
    description: 'Especialistas y pacientes, conectados.',
    images: ['/logos/delta-iso-1024.png'],
  },
};

// F4 (2026-04-29): viewport meta para Safari iOS — sin maximum-scale (a11y) y con viewport-fit=cover para notch
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${jakarta.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
