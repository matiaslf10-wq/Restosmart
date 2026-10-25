'use client';
import { useEffect, useState } from 'react';
import type { CollectionConfig, Method } from '@/lib/cobros/model';
export type PaymentReceipt = { token: string; method: Method; amount: number; currency: string; state: string; require_payment: boolean };

export function CollectionMethods({ restaurantId, disabled, onChoose }: { restaurantId: string | null; disabled: boolean; onChoose: (method: Method['kind']) => void }) {
  const [result, setResult] = useState<{ scope: string; config?: CollectionConfig | null; error?: string }>();
  useEffect(() => {
    let live = true;
    if (!restaurantId) return;
    fetch(`/api/public/cobros?restaurantId=${encodeURIComponent(restaurantId)}`, { cache: 'no-store' }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (live) setResult({ scope: restaurantId, config: body.config });
    }).catch(() => { if (live) setResult({ scope: restaurantId, error: 'No se pudieron cargar los medios de cobro. Actualizá la página.' }); });
    return () => { live = false; };
  }, [restaurantId]);
  if (!result || result.scope !== restaurantId) return <p>Cargando medios de cobro…</p>;
  if (result.error) return <p role="alert">{result.error}</p>;
  const config = result.config;
  const methods = config?.methods ?? [{ kind: 'efectivo' as const, label: 'Efectivo' }];
  return <div className="space-y-2"><p>Elegí el medio de cobro del comercio.</p>{methods.map(method => <button key={method.kind} type="button" className="w-full rounded border p-3 disabled:opacity-50" disabled={disabled} onClick={() => onChoose(method.kind)}>Confirmar pedido · {method.label}</button>)}{!methods.length && <p>El comercio no tiene medios habilitados. Consultá al personal.</p>}{config?.require_payment && <p>La cocina comenzará después de que el comercio confirme la acreditación.</p>}</div>;
}

export function CollectionReceipt({ payment }: { payment: PaymentReceipt | null }) {
  return payment ? <Receipt key={payment.token} payment={payment} /> : null;
}
function Receipt({ payment }: { payment: PaymentReceipt }) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const method = payment.method;
  async function declare() {
    setBusy(true);
    try {
      const response = await fetch('/api/public/cobros', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: payment!.token }) });
      const body = await response.json();
      setStatus(response.ok ? 'Declaración registrada. Pendiente de verificación por el comercio.' : body.error);
    } catch { setStatus('No se pudo conectar. Podés reintentar.'); } finally { setBusy(false); }
  }
  return <section className="my-4 rounded border bg-white p-4 space-y-2" aria-label="Instrucciones de pago"><h2>Pago al comercio · {method.label}</h2><p>{payment.currency} {Number(payment.amount).toFixed(2)}</p>{method.holder && <p>Titular: {method.holder}</p>}{method.alias && <p>Alias: {method.alias}</p>}{method.account && <p>CBU/CVU: {method.account}</p>}<p className="whitespace-pre-wrap">{method.instructions}</p>{method.url && <a href={method.url} target="_blank" rel="noopener noreferrer" className="underline">Abrir link de pago del comercio</a>}{method.kind !== 'efectivo' && <button type="button" disabled={busy || status.startsWith('Declaración registrada')} onClick={declare} className="block rounded border p-2">Ya realicé el pago</button>}<p>La declaración no acredita el pago. El comercio verificará su propia cuenta.</p>{method.kind === 'efectivo' && <p>Aboná al personal del comercio.</p>}{status && <p role="status">{status}</p>}</section>;
}
