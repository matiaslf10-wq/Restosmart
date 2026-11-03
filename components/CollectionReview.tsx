'use client';
import { useCallback, useEffect, useState } from 'react';
type Payment = { order_id: number; method: { kind: string }; amount: number; state: string; currency: string };
export default function CollectionReview({ restaurantId }: { restaurantId: string }) {
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
  return <section className="rounded-2xl border border-amber-300 bg-white p-5"><h2 className="text-xl font-bold">Cobros de pedidos</h2><p className="mt-1 text-sm text-slate-600">Chequeá la transferencia en tu cuenta o recibí el efectivo antes de marcarlo y entregar.</p>{error && <p role="alert" className="mt-3 text-red-700">{error}</p>}<div className="mt-3 grid gap-3 md:grid-cols-2">{payments.map(payment => <article key={payment.order_id} className={`rounded-xl border p-4 ${payment.state === 'confirmed' ? 'border-emerald-300 bg-emerald-50' : payment.state === 'declared' ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}><p className="font-bold">Pedido #{payment.order_id} · {payment.currency} {Number(payment.amount).toFixed(2)}</p><p>{payment.method.kind === 'efectivo' ? 'Efectivo · cobrar en caja' : 'Transferencia'}</p><p className="my-2 font-semibold">{payment.state === 'confirmed' ? '✓ Cobro chequeado' : payment.state === 'declared' ? 'El cliente avisó que transfirió · verificar acreditación' : payment.state === 'incident' ? 'Cobro con incidencia' : 'Pendiente de pago'}</p>{payment.state !== 'confirmed' && payment.state !== 'incident' && <button type="button" disabled={busy !== null} onClick={() => void confirm(payment.order_id)} className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy === payment.order_id ? 'Guardando…' : payment.method.kind === 'efectivo' ? 'Recibí el efectivo · chequeado' : 'Verifiqué la transferencia · chequeado'}</button>}</article>)}</div>{!payments.length && !error && <p className="mt-3 text-sm">Todavía no hay cobros registrados para esta sucursal.</p>}</section>;
}
