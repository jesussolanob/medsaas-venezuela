import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { HelpWidget } from '@/components/help/HelpWidget';
import { MetaPixelPageViews } from '@/components/analytics/MetaPixel';

// 2026-05-02: Cambio de Geist → Plus Jakarta Sans / JetBrains Mono
// según el design system "Delta Health Tech" (handoff bundle).
// Plus Jakarta Sans para UI y display; JetBrains Mono solo para metadata
// (cédulas, IDs, fechas tabulares, números monoespaciados).
// 2026-11-13: los archivos viven en el repo (app/fonts). next/font/google los
// descargaba en cada build y Cloud Build fallaba cuando no llegaba a Google Fonts,
// lo que bloqueaba TODOS los despliegues. Son las fuentes variables (subset latin)
// de Google Fonts: mismas fuentes, mismas variables CSS.
const jakarta = localFont({
  src: './fonts/PlusJakartaSans-latin.woff2',
  variable: '--font-sans',
  weight: '200 800',
  display: 'swap',
});

const jetbrains = localFont({
  src: './fonts/JetBrainsMono-latin.woff2',
  variable: '--font-mono',
  weight: '100 800',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Delta Salud — Plataforma médica para Venezuela',
  description:
    'El primer software de salud hecho en Venezuela. Gestiona pacientes, agenda, historial clínico y finanzas desde un solo lugar.',
  icons: {
    icon: '/logos/delta-iso-256.png',
    apple: '/logos/delta-iso-256.png',
  },
  openGraph: {
    title: 'Delta Salud',
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
    title: 'Delta Salud',
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
      <body className="min-h-full flex flex-col">
        {children}
        <HelpWidget />
        <MetaPixelPageViews />
      </body>
    </html>
  );
}
