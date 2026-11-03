'use client';
import { useEffect, useState } from 'react';
import type { CollectionConfig, Method } from '@/lib/cobros/model';
export type PaymentReceipt = { token: string; method: Method; amount: number; currency: string; state: string; require_payment: boolean };
export function CopyPaymentValue({ label, value }: { label: string; value: string }) {
  const [message, setMessage] = useState('');
  async function copy() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const field = document.createElement('textarea'); field.value = value; field.style.position = 'fixed'; field.style.opacity = '0'; document.body.appendChild(field); field.select();
        const copied = document.execCommand('copy'); field.remove(); if (!copied) throw new Error();
      }
      setMessage('Copiado');
    } catch { setMessage('No se pudo copiar. Mantené presionado el dato para copiarlo.'); }
  }
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-sm font-semibold">{label}</p><p className="break-all select-all">{value}</p><button type="button" onClick={() => void copy()} className="mt-2 rounded-lg border bg-white px-4 py-2">Copiar {label.toLowerCase()}</button><span className="ml-2 text-sm" role="status">{message}</span></div>;
}
export function CollectionMethods({ restaurantId, disabled, onChoose }: { restaurantId: string | null; disabled: boolean; onChoose: (method: Method['kind']) => void }) {
  const [result, setResult] = useState<{ scope: string; config?: CollectionConfig | null; error?: string }>();
  useEffect(() => {
    let live = true;
    if (!restaurantId) return;
    fetch(`/api/public/cobros?restaurantId=${encodeURIComponent(restaurantId)}`, { cache: 'no-store' }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      if (live) setResult({ scope: restaurantId, config: body.config });
    }).catch(() => { if (live) setResult({ scope: restaurantId, error: 'No se pudieron cargar los medios de pago. Actualizá la página.' }); });
    return () => { live = false; };
  }, [restaurantId]);
  if (!result || result.scope !== restaurantId) return <p>Cargando medios de pago…</p>;
  if (result.error) return <p role="alert">{result.error}</p>;
  const transfer = result.config?.methods.find(method => method.kind === 'transferencia');
  return <div className="space-y-3"><p className="font-semibold">¿Cómo querés pagar?</p><div className="grid grid-cols-2 gap-3"><button type="button" className="rounded-xl bg-slate-900 p-4 font-semibold text-white disabled:opacity-50" disabled={disabled} onClick={() => onChoose('efectivo')}>Efectivo</button><button type="button" className="rounded-xl border border-slate-400 bg-white p-4 font-semibold text-slate-900 disabled:opacity-50" disabled={disabled || !transfer} onClick={() => onChoose('transferencia')}>Transferencia</button></div>{!transfer && <p className="text-sm">Transferencia todavía no está configurada por el comercio.</p>}</div>;
}
export function CollectionReceipt({ payment }: { payment: PaymentReceipt | null }) { return payment ? <Receipt key={payment.token} payment={payment} /> : null; }
function Receipt({ payment }: { payment: PaymentReceipt }) {
  const [status, setStatus] = useState('');
  const [declared, setDeclared] = useState(['declared', 'confirmed'].includes(payment.state));
  const [busy, setBusy] = useState(false);
  const method = payment.method;
  async function declare() {
    setBusy(true);
    try {
      const response = await fetch('/api/public/cobros', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: payment.token }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No se pudo avisar al mostrador.');
      setDeclared(true); setStatus('Aviso enviado al mostrador. El personal verificará tu transferencia.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'No se pudo conectar. Reintentá.'); } finally { setBusy(false); }
  }
  return <section className="my-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900" aria-label="Instrucciones de pago"><h2 className="text-lg font-bold">{method.kind === 'efectivo' ? 'Pago en efectivo' : 'Pago por transferencia'}</h2><p className="text-xl font-semibold">{payment.currency} {Number(payment.amount).toFixed(2)}</p>{method.kind === 'efectivo' ? <p>Acercate a la caja para pagar mientras esperás tu pedido.</p> : <><p>Transferí este monto y avisá al mostrador con el botón de abajo.</p>{method.holder && <p>Titular: {method.holder}</p>}{method.alias && <CopyPaymentValue label="Alias" value={method.alias} />}{method.account && <CopyPaymentValue label="CBU/CVU" value={method.account} />}<button type="button" disabled={busy || declared} onClick={() => void declare()} className="w-full rounded-xl bg-emerald-700 p-3 font-semibold text-white disabled:opacity-60">{busy ? 'Enviando aviso…' : declared ? 'Aviso enviado al mostrador' : 'Ya transferí · avisar al mostrador'}</button><p className="text-sm">El personal debe chequear la acreditación antes de entregar el pedido.</p></>}{status && <p role="status">{status}</p>}</section>;
}
