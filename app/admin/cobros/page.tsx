'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { canTransition, type CollectionConfig, type Method } from '@/lib/cobros/model';
type Payment = { order_id: number; method: Method; amount: number; currency: string; state: string; created_at: string; updated_at: string };
type Event = { id: number; order_id: number | null; action: string; operator: string; note: string | null; created_at: string };
type Snapshot = { tenant: CollectionConfig | null; branch: CollectionConfig | null; effective: CollectionConfig | null; payments: Payment[]; events: Event[] };
const kinds: Method['kind'][] = ['transferencia', 'mercadopago', 'externo', 'efectivo'];
function Cobros() {
  const params = useSearchParams();
  const endpoint = `/api/admin/cobros?${params.toString()}`;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [scope, setScope] = useState('branch');
  const [inherit, setInherit] = useState(true);
  const [config, setConfig] = useState<CollectionConfig>({ methods: [], require_payment: false });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: 'no-store' }); const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setSnapshot(body);
    return body as Snapshot;
  }, [endpoint]);
  useEffect(() => { let live = true; load().then(body => { if (live) { setInherit(!body.branch); setConfig(body.branch ?? body.tenant ?? { methods: [], require_payment: false }); } }).catch(error => { if (live) setMessage(error.message); }); return () => { live = false; }; }, [load]);
  function changeScope(value: string) {
    setScope(value); setInherit(value === 'branch' && !snapshot?.branch);
    setConfig((value === 'tenant' ? snapshot?.tenant : snapshot?.branch ?? snapshot?.tenant) ?? { methods: [], require_payment: false });
  }
  async function send(body: object) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      await load(); setMessage('Operación registrada.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo completar.'); } finally { setBusy(false); }
  }
  function update(kind: Method['kind'], field: keyof Method, value: string) {
    setConfig(current => ({ ...current, methods: current.methods.map(method => method.kind === kind ? { ...method, [field]: value } : method) }));
  }
  return <main className="mx-auto max-w-5xl space-y-6 p-6"><h1 className="text-2xl font-bold">Cobros propios del comercio</h1><p>Los fondos se reciben en tus cuentas. Confirmá la acreditación solo después de verificarla allí.</p>{message && <p role="status">{message}</p>}
    {snapshot && <><form className="space-y-4" onSubmit={event => { event.preventDefault(); void send({ action: 'config', scope, inherit, config }); }}>
      <label>Configurar <select value={scope} onChange={event => changeScope(event.target.value)}><option value="tenant">Todo el comercio (tenant)</option><option value="branch">Sucursal seleccionada</option></select></label>
      {scope === 'branch' && <label className="block"><input type="checkbox" checked={inherit} onChange={event => setInherit(event.target.checked)} /> Heredar configuración del tenant</label>}
      <fieldset disabled={busy || (scope === 'branch' && inherit)} className="space-y-4"><label><input type="checkbox" checked={config.require_payment} onChange={event => setConfig({ ...config, require_payment: event.target.checked })} /> Exigir pago confirmado antes de enviar a cocina</label>
        {kinds.map(kind => {
          const method = config.methods.find(method => method.kind === kind);
          return <fieldset key={kind} className="rounded border p-3 space-y-2"><legend>{kind}</legend><label><input type="checkbox" checked={!!method} onChange={event => setConfig({ ...config, methods: event.target.checked ? [...config.methods, { kind, label: kind }] : config.methods.filter(method => method.kind !== kind) })} /> Habilitado</label>{method && <div className="grid gap-2"><label>Nombre visible<input className="block border p-2" maxLength={100} value={method.label} onChange={event => update(kind, 'label', event.target.value)} /></label>{(kind === 'mercadopago' || kind === 'externo') && <label>URL HTTPS de la cuenta propia<input type="url" required className="block w-full border p-2" value={method.url ?? ''} onChange={event => update(kind, 'url', event.target.value)} /></label>}{kind === 'transferencia' && <>{(['alias', 'account', 'holder'] as const).map(field => <label key={field}>{field === 'account' ? 'CBU/CVU' : field === 'holder' ? 'Titular' : 'Alias'}<input className="block border p-2" maxLength={150} value={method[field] ?? ''} onChange={event => update(kind, field, event.target.value)} /></label>)}</>}<label>Instrucciones<textarea className="block w-full border p-2" maxLength={1000} value={method.instructions ?? ''} onChange={event => update(kind, 'instructions', event.target.value)} /></label></div>}</fieldset>;
        })}
      </fieldset><button disabled={busy} className="rounded border p-3">Guardar configuración</button>
    </form>
    <section className="space-y-3"><h2 className="text-xl">Pagos (últimos 100)</h2><button disabled={busy} onClick={() => { void load().catch(error => setMessage(error.message)); }}>Actualizar</button>{snapshot.payments.map(payment => <article key={payment.order_id} className="border p-3"><p>Pedido #{payment.order_id} · {payment.method.label} · {payment.currency} {payment.amount} · {payment.state}</p><p>Creación: {new Date(payment.created_at).toLocaleString()} · Actualización: {new Date(payment.updated_at).toLocaleString()}</p>{canTransition(payment.state, 'confirm', payment.method.kind) && <button disabled={busy} className="mr-3 border p-2" onClick={() => { void send({ action: 'confirm', orderId: payment.order_id }); }}>Verifiqué la acreditación en mi cuenta / recibí efectivo</button>}{canTransition(payment.state, 'incident', payment.method.kind) && <button disabled={busy} className="border p-2" onClick={() => { const note = window.prompt('Describí la incidencia'); if (note?.trim()) void send({ action: 'incident', orderId: payment.order_id, note }); }}>Marcar incidencia</button>}</article>)}</section>
    <section><h2 className="text-xl">Historial (últimas 200 acciones)</h2>{snapshot.events.map(event => <p key={event.id}>{new Date(event.created_at).toLocaleString()} · Pedido {event.order_id ?? '—'} · {event.action} · {event.operator} · {event.note}</p>)}</section></>}
  </main>;
}
export default function Page() { return <Suspense fallback={<p>Cargando cobros…</p>}><Cobros /></Suspense>; }
