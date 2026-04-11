'use client';

import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

type Props = {
  localName?: string | null;
  routePath?: string;
  title?: string;
  description?: string;
  badgeLabel?: string;
};

export default function TakeAwayQrCard({
  localName,
  routePath = '/pedir',
  title = 'QR de take away',
  description = 'Escaneá este código para abrir la pantalla pública de pedidos.',
  badgeLabel = 'QR',
}: Props) {
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const normalizedPath = useMemo(() => {
    if (!routePath) return '/pedir';
    return routePath.startsWith('/') ? routePath : `/${routePath}`;
  }, [routePath]);

  const qrUrl = useMemo(() => {
    if (!origin) return '';
    return `${origin.replace(/\/$/, '')}${normalizedPath}`;
  }, [origin, normalizedPath]);

  function abrirPreview() {
    if (!qrUrl) return;
    window.open(qrUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm print:shadow-none">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
          {badgeLabel}
        </span>
      </div>

      <div className="mt-3">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          {description}
        </p>
      </div>

      <div className="mt-5 flex justify-center">
        <div className="rounded-3xl border border-slate-200 bg-white p-4">
          {qrUrl ? (
            <QRCodeSVG value={qrUrl} size={240} includeMargin />
          ) : (
            <div className="flex h-[240px] w-[240px] items-center justify-center text-sm text-slate-500">
              Generando QR...
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 text-center">
        <p className="text-lg font-semibold text-slate-900">
          {localName?.trim() || 'RestoSmart'}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {normalizedPath === '/pedir'
            ? 'Escaneá para hacer tu pedido'
            : `Escaneá para abrir ${normalizedPath}`}
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Enlace codificado
        </p>
        <p className="mt-2 break-all text-sm text-slate-700">
          {qrUrl || 'Generando enlace...'}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 print:hidden">
        <button
          type="button"
          onClick={abrirPreview}
          disabled={!qrUrl}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          Abrir enlace
        </button>

        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Imprimir QR
        </button>
      </div>
    </div>
  );
}