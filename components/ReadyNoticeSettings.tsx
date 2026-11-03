'use client';
import { useEffect, useState } from 'react';
export default function ReadyNoticeSettings({ restaurantId }: { restaurantId: string | null }) {
  const [mode, setMode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/admin/ready-notice?restaurantId=${encodeURIComponent(restaurantId || '')}`;
  useEffect(() => {
    if (!restaurantId) return;
    let live = true;
    fetch(endpoint, { cache: 'no-store' }).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); if (live) setMode(body.mode || ''); }).catch(() => { if (live) setMessage('No se pudo cargar la opción actual.'); });
    return () => { live = false; };
  }, [endpoint, restaurantId]);
  async function save() {
    setBusy(true); setMessage('');
    try { const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setMessage('Aviso guardado para esta sucursal.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar.'); } finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">Aviso de pedido listo en mesas</h2><p>Elegí qué ve el cliente cuando su pedido está listo. Esta opción no cambia el aviso de take away.</p>{!restaurantId ? <p>Abrí Configurar local desde la tarjeta de una sucursal para elegir su aviso.</p> : <><label className="block rounded-xl border p-4"><input type="radio" name="ready_notice" checked={mode === 'table_service'} onChange={() => setMode('table_service')} /> <strong>Con mozo</strong><p>Tu pedido está listo. En breve lo llevamos a tu mesa.</p></label><label className="block rounded-xl border p-4"><input type="radio" name="ready_notice" checked={mode === 'counter'} onChange={() => setMode('counter')} /> <strong>Retiro por mostrador</strong><p>Tu pedido está listo. Podés pasar por mostrador para retirarlo.</p></label><button type="button" disabled={busy || !mode} onClick={() => void save()} className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar aviso de esta sucursal'}</button></>}{message && <p role="status">{message}</p>}</section>;
}
