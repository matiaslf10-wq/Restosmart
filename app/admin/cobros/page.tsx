'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import BranchPicker from '@/components/BranchPicker';
import { CopyPaymentValue } from '@/components/CollectionCheckout';
import type { Method } from '@/lib/cobros/model';
function Cobros() {
  const params = useSearchParams();
  const restaurantId = params.get('restaurantId') || params.get('restaurant_id');
  const [form, setForm] = useState({ alias: '', account: '', holder: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const endpoint = `/api/admin/cobros?restaurantId=${encodeURIComponent(restaurantId || '')}`;
  useEffect(() => {
    if (!restaurantId) return;
    let live = true;
    fetch(endpoint, { cache: 'no-store' }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      const method = body.effective?.methods?.find((item: Method) => item.kind === 'transferencia');
      if (live) setForm({ alias: method?.alias || '', account: method?.account || '', holder: method?.holder || '' });
    }).catch(error => { if (live) setMessage(error.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [endpoint, restaurantId]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const transfer = Object.values(form).some(value => value.trim()) ? [{ kind: 'transferencia', label: 'Transferencia', ...form }] : [];
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'config', scope: 'branch', inherit: false, config: { methods: [{ kind: 'efectivo', label: 'Efectivo' }, ...transfer], require_payment: false } }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      setMessage('Datos guardados. Tus clientes ya pueden usarlos para transferir.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar.'); } finally { setBusy(false); }
  }
  if (!restaurantId) return <main className="p-6"><BranchPicker destination="/admin/cobros" title="Cobros propios" /></main>;
  return <main className="mx-auto max-w-2xl space-y-5 p-6"><h1 className="text-2xl font-bold">Datos para transferencias</h1><p>El efectivo siempre está disponible. Completá estos datos para ofrecer también transferencia en esta sucursal.</p><p className="rounded-xl bg-blue-50 p-4 text-sm">Los pedidos pueden prepararse mientras se espera el pago. En Mostrador chequeás el cobro y después entregás el pedido cuando esté listo.</p>{loading ? <p>Cargando datos…</p> : <form className="space-y-4 rounded-2xl border bg-white p-5" onSubmit={event => void save(event)}>{(['holder', 'alias', 'account'] as const).map(key => <label className="grid gap-2" key={key}><span className="font-semibold">{key === 'holder' ? 'Titular de la cuenta' : key === 'alias' ? 'Alias' : 'CBU / CVU'}</span><input className="min-w-0 w-full rounded-xl border p-3" value={form[key]} maxLength={key === 'account' ? 22 : 150} inputMode={key === 'account' ? 'numeric' : 'text'} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}<p className="text-sm text-slate-600">Para transferencias, indicá titular y al menos alias o CBU/CVU de 22 dígitos. Si dejás todo vacío, se ofrece solo efectivo.</p><button disabled={busy} className="w-full rounded-xl bg-slate-900 p-3 font-semibold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar datos de transferencia'}</button></form>}{message && <p role="status">{message}</p>}{form.alias && <CopyPaymentValue label="Alias" value={form.alias} />}{form.account && <CopyPaymentValue label="CBU/CVU" value={form.account} />}</main>;
}
export default function Page() { return <Suspense fallback={<p>Cargando cobros…</p>}><Cobros /></Suspense>; }
