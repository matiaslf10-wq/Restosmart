'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type PendingOrder = {
  id: number;
  codigo_publico?: string | null;
  creado_en?: string | null;
  estado?: string | null;
  total?: number | string | null;
  origen?: string | null;
  cliente_nombre?: string | null;
  cliente_telefono?: string | null;
  direccion_entrega?: string | null;
  estado_pago?: string | null;
};

export default function AdminDeliveryPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [restaurantId, setRestaurantId] = useState('');

  const loadOrders = useCallback(async (scope: string) => {
    setLoading(true);
    setError('');

    try {
      const query = scope
        ? `?restaurantId=${encodeURIComponent(scope)}`
        : '';

      const response = await fetch(
        `/api/admin/delivery-pedidos-pendientes${query}`,
        { cache: 'no-store', credentials: 'include' }
      );

      if (response.status === 401) {
        router.replace('/admin/login');
        return;
      }

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error || 'No se pudieron cargar los pedidos.');
      }

      setOrders(Array.isArray(result?.pedidos) ? result.pedidos : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error al cargar pedidos.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const sessionResponse = await fetch('/api/admin/session', {
          cache: 'no-store',
          credentials: 'include',
        });

        if (!sessionResponse.ok) {
          router.replace('/admin/login');
          return;
        }

        const result = await sessionResponse.json();
        if (!result?.session?.capabilities?.delivery) {
          router.replace('/admin');
          return;
        }

        const params = new URLSearchParams(window.location.search);
        const scope =
          params.get('restaurantId') ||
          params.get('restaurant_id') ||
          String(result.session?.restaurant?.id ?? '');

        if (!active) return;
        setRestaurantId(scope);
        await loadOrders(scope);
      } catch {
        if (active) setError('No se pudo verificar la sesión administrativa.');
      } finally {
        if (active) setChecking(false);
      }
    }

    void initialize();
    return () => { active = false; };
  }, [loadOrders, router]);

  async function changeCashStatus(id: number, action: 'aprobar' | 'rechazar') {
    if (processing !== null) return;

    setProcessing(id);
    setError('');

    try {
      const query = restaurantId
        ? `?restaurantId=${encodeURIComponent(restaurantId)}`
        : '';

      const response = await fetch(
        `/api/delivery/pedidos/${id}/estado-efectivo${query}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion: action }),
        }
      );

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error || 'No se pudo actualizar el pedido.');
      }

      await loadOrders(restaurantId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error al actualizar pedido.');
    } finally {
      setProcessing(null);
    }
  }

  if (checking) {
    return <main className="p-6 text-slate-600">Verificando acceso...</main>;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Pedidos de delivery
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Validación de pedidos pendientes de pago en efectivo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadOrders(restaurantId)}
          disabled={loading}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Actualizando...' : 'Actualizar pedidos'}
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {!loading && orders.length === 0 && !error && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
          No hay pedidos de delivery pendientes de aprobación.
        </div>
      )}

      <div className="space-y-3">
        {orders.map((order) => (
          <article
            key={order.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="font-semibold text-slate-900">
                  Pedido #{order.id}
                </h2>
                {order.codigo_publico && (
                  <p className="text-sm text-slate-500">
                    Código: {order.codigo_publico}
                  </p>
                )}
                <p className="text-sm">
                  {order.cliente_nombre || 'Cliente sin nombre'}
                </p>
                {order.cliente_telefono && (
                  <p className="text-sm text-slate-600">{order.cliente_telefono}</p>
                )}
                {order.direccion_entrega && (
                  <p className="text-sm text-slate-600">{order.direccion_entrega}</p>
                )}
                <p className="text-sm text-slate-600">
                  Estado: {order.estado || 'pendiente'}
                  {' · '}
                  Pago: {order.estado_pago || 'pendiente'}
                </p>
              </div>
              <div className="space-y-3 text-right">
                <p className="text-lg font-semibold">
                  {Number(order.total ?? 0).toLocaleString('es-AR', {
                    style: 'currency',
                    currency: 'ARS',
                  })}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={processing !== null}
                    onClick={() => void changeCashStatus(order.id, 'aprobar')}
                    className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Aprobar efectivo
                  </button>
                  <button
                    type="button"
                    disabled={processing !== null}
                    onClick={() => void changeCashStatus(order.id, 'rechazar')}
                    className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}