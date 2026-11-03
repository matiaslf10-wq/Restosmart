'use client';
import type { OrderAlerts } from '@/lib/useOrderAlerts';
export default function OrderAlertControl({ alerts }: { alerts: OrderAlerts }) {
  return <section className="my-3 space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-slate-900"><button type="button" onClick={() => void alerts.enable()} className="rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white">{alerts.enabled ? 'Probar sonido y revisar avisos' : 'Activar sonido y notificaciones'}</button><p className="text-sm">Permití las notificaciones cuando el navegador lo solicite y mantené esta página abierta para recibir los avisos.</p>{alerts.message && <p role="status" className="text-sm">{alerts.message}</p>}{alerts.notice && <div role="alert" className="rounded-xl border border-emerald-400 bg-emerald-50 p-3 font-semibold">{alerts.notice}<button type="button" onClick={alerts.dismiss} className="ml-3 underline">Entendido</button></div>}</section>;
}
