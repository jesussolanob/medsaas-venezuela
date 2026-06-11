'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Download, QrCode } from 'lucide-react';

interface BookingQrCodeProps {
  url: string;
}

export default function BookingQrCode({ url }: BookingQrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!url) {
      setIsReady(false);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    setRenderError(null);
    setIsReady(false);

    QRCode.toCanvas(canvas, url, {
      width: 220,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
      .then(() => {
        setIsReady(true);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Error al generar el código QR';
        setRenderError(msg);
      });
  }, [url]);

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas || !isReady) return;

    const dataUrl = canvas.toDataURL('image/png');
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = 'qr-booking.png';
    anchor.click();
  }

  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 w-[220px] h-[220px] border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
        <QrCode className="w-8 h-8 text-slate-300" aria-hidden="true" />
        <p className="text-xs text-slate-400 text-center px-4">El código QR aparecerá aquí</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative rounded-xl overflow-hidden border border-slate-200 bg-white p-1 shadow-sm"
        role="img"
        aria-label={`Código QR para agendar cita: ${url}`}
      >
        <canvas
          ref={canvasRef}
          className={`block transition-opacity duration-200 ${isReady ? 'opacity-100' : 'opacity-0'}`}
          aria-hidden="true"
        />
        {!isReady && !renderError && (
          <div className="absolute inset-0 flex items-center justify-center bg-white rounded-xl">
            <div
              className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      {renderError && (
        <p className="text-xs text-red-500 text-center max-w-[220px]" role="alert">
          {renderError}
        </p>
      )}

      <button
        onClick={handleDownload}
        disabled={!isReady}
        className="flex items-center gap-2 px-4 py-2 bg-teal-500 text-white text-sm font-semibold rounded-lg hover:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Descargar código QR como imagen PNG"
      >
        <Download className="w-4 h-4" aria-hidden="true" />
        Descargar QR (PNG)
      </button>
    </div>
  );
}
