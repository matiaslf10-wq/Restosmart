'use client';
import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from 'react';
type Payment = { order_id: number; method: { kind: string }; amount: number; state: string; currency: string };
type Review = { payments: Payment[]; error: string; busy: number | null; confirm: (orderId: number) => Promise<void> };
const ReviewContext = createContext<Review | null>(null);
export function OrderPaymentNotice({ orderId }: { orderId: number }) {
  const review = useContext(ReviewContext);
  if (!review) return null;
  const payment = review.payments.find(item => item.order_id === orderId);
  if (review.error) return <p role="alert" className="my-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">{review.error}</p>;
  if (!payment) return null;
  const confirmed = payment.state === 'confirmed';
  return <div className={`my-2 w-full space-y-2 rounded-xl border p-3 text-sm ${confirmed ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : 'border-amber-400 bg-amber-50 text-amber-950'}`}>
    <p className="font-bold">{confirmed ? '✓ Cobro chequeado' : payment.method.kind === 'transferencia' ? payment.state === 'declared' ? 'Transferencia avisada — pendiente de chequeo' : 'Transferencia pendiente' : 'Efectivo — pendiente de cobro'}</p>
    <p>Pedido #{payment.order_id} · {payment.currency} {Number(payment.amount).toFixed(2)}</p>
    {payment.method.kind === 'transferencia' && !confirmed && <p>Verificá la acreditación en tu cuenta antes de marcarlo.</p>}
    {!confirmed && payment.state !== 'incident' && <button type="button" disabled={review.busy !== null} onClick={() => void review.confirm(orderId)} className="rounded-lg bg-emerald-700 px-3 py-2 font-semibold text-white disabled:opacity-50">{review.busy === orderId ? 'Guardando…' : payment.method.kind === 'transferencia' ? 'Verifiqué transferencia · chequeado' : 'Recibí efectivo · chequeado'}</button>}
  </div>;
}
export default function CollectionReview({ restaurantId, children }: { restaurantId: string; children: ReactNode }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const endpoint = `/api/admin/cobros?restaurantId=${encodeURIComponent(restaurantId)}`;
  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: 'no-store' }); const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'No se pudieron cargar los cobros.');
    return body.payments as Payment[];
  }, [endpoint]);
  useEffect(() => {
    let active = true;
    const refresh = () => load().then(data => { if (active) { setPayments(data); setError(''); } }).catch(() => { if (active) setError('No se pudieron actualizar los cobros. Reintentá antes de entregar.'); });
    void refresh(); const timer = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [load]);
  async function confirm(orderId: number) {
    setBusy(orderId); setError('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm', orderId }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      setPayments(await load());
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo confirmar el cobro.'); } finally { setBusy(null); }
  }
  return <ReviewContext.Provider value={{ payments, error, busy, confirm }}>{children}</ReviewContext.Provider>;
}
