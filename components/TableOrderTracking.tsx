'use client';
import { useEffect, useRef, useState } from 'react';
import { useOrderAlerts } from '@/lib/useOrderAlerts';
import OrderAlertControl from './OrderAlertControl';
export type TrackedTableOrder = { id: number; estado: string; tracking_token?: string };
export default function TableOrderTracking({ restaurantId, table, order }: { restaurantId: string; table: number; order: TrackedTableOrder | null }) {
  const alerts = useOrderAlerts('/sounds/PedidoListo.mp3');
  const { notify } = alerts;
  const [tracked, setTracked] = useState<TrackedTableOrder | null>(null);
  const [error, setError] = useState('');
  const [readyMessage, setReadyMessage] = useState('Consultá al personal del local.');
  const notified = useRef(new Set<number>());
  const key = `restosmart:table:${restaurantId}:${table}`;
  useEffect(() => {
    let live = true;
    let inFlight = false;
    let current: TrackedTableOrder | null = order;
    if (!current) { try { current = JSON.parse(localStorage.getItem(key) || 'null'); } catch { /* Private browsing may disable storage. */ } }
    async function refresh() {
      if (!current?.tracking_token || inFlight) return;
      inFlight = true;
      try {
        const response = await fetch('/api/public/pedido-estado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restaurantId, token: current.tracking_token }), cache: 'no-store', signal: AbortSignal.timeout(10000) });
        const body = await response.json();
        if (!live) return;
        if (!response.ok || body.pedido?.id !== current.id) throw new Error();
        const readyText = typeof body.ready_message === 'string' ? body.ready_message : 'Consultá al personal del local.';
        setReadyMessage(readyText);
        const next = { ...current, estado: body.pedido.estado };
        const finished = ['cerrado','entregado','cancelado'].includes(next.estado);
        setTracked(finished ? null : next); setError('');
        try { if (finished) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(next)); } catch { /* State remains available in this page. */ }
        if (finished) { current = null; return; }
        if (next.estado === 'listo' && !notified.current.has(next.id)) {
          notified.current.add(next.id);
          void notify('Tu pedido está listo', `Pedido #${next.id}. ${readyText}`, `table-ready-${restaurantId}-${next.id}`);
        }
      } catch { if (live) setError('No se pudo actualizar tu pedido. Reintentamos automáticamente.'); }
      finally { inFlight = false; }
    }
    void refresh(); const timer = setInterval(refresh,5000);
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus',resume); document.addEventListener('visibilitychange',resume);
    return () => { live = false; clearInterval(timer); window.removeEventListener('focus',resume); document.removeEventListener('visibilitychange',resume); };
  }, [order, restaurantId, key, notify]);
  return <section className="my-4 w-full max-w-lg space-y-3"><OrderAlertControl alerts={alerts} />{tracked && <div role="status" className={`rounded-xl border p-4 ${tracked.estado === 'listo' ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : 'border-blue-200 bg-blue-50 text-slate-900'}`}><h2 className="text-lg font-bold">{tracked.estado === 'listo' ? '✓ Tu pedido está listo' : 'Tu pedido está en curso'}</h2><p>Pedido #{tracked.id}</p>{tracked.estado === 'listo' && <p>{readyMessage}</p>}</div>}{error && <p role="alert">{error}</p>}</section>;
}
