'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
  normalizeBusinessMode,
  type BusinessMode,
} from '@/lib/plans';

const DELIVERY_MESA_ID = 0;

type ItemPedido = {
  id: number;
  cantidad: number;
  comentarios: string | null;
  producto: { nombre: string } | null;
};

type Pedido = {
  id: number;
  mesa_id: number;
  creado_en: string;
  estado: string;
  items: ItemPedido[];
  codigo_publico?: string | null;
  origen?: string | null;
  tipo_servicio?: string | null;
  cliente_nombre?: string | null;
};

type MesaRef = {
  id: number;
  numero: number | null;
  nombre: string | null;
};

type FiltroEstado = 'todos' | 'pendiente' | 'en_preparacion' | 'listo';
type PedidoKind = 'salon' | 'takeaway' | 'delivery';

type AdminSessionPayload = {
  adminId?: string;
  business_mode?: BusinessMode;
  capabilities?: {
    waiter_mode?: boolean;
  };
  restaurant?: {
    business_mode?: BusinessMode;
  } | null;
};

function isDeliveryPedido(pedido: Pedido) {
  const tipo = String(pedido.tipo_servicio ?? '').trim().toLowerCase();
  const origen = String(pedido.origen ?? '').trim().toLowerCase();

  return (
    tipo === 'delivery' ||
    tipo === 'envio' ||
    origen === 'delivery' ||
    origen === 'delivery_whatsapp' ||
    origen === 'delivery_manual'
  );
}

function isTakeawayPedido(pedido: Pedido) {
  const tipo = String(pedido.tipo_servicio ?? '').trim().toLowerCase();
  const origen = String(pedido.origen ?? '').trim().toLowerCase();

  return (
    tipo === 'takeaway' ||
    tipo === 'take_away' ||
    tipo === 'pickup' ||
    tipo === 'pick_up' ||
    tipo === 'retiro' ||
    origen === 'takeaway' ||
    origen === 'takeaway_web' ||
    origen === 'takeaway_manual' ||
    origen === 'pickup' ||
    origen === 'retiro'
  );
}

function getPedidoKind(pedido: Pedido): PedidoKind {
  if (isDeliveryPedido(pedido)) return 'delivery';
  if (isTakeawayPedido(pedido)) return 'takeaway';

  if (pedido.mesa_id === DELIVERY_MESA_ID) {
    return 'delivery';
  }

  return 'salon';
}

function getClienteNombre(pedido: Pedido) {
  const value = String(pedido.cliente_nombre ?? '').trim();
  return value.length > 0 ? value : null;
}

function getPedidoLabel(pedido: Pedido, mesasMap: Record<number, MesaRef>) {
  const kind = getPedidoKind(pedido);
  const clienteNombre = getClienteNombre(pedido);

  if (kind === 'delivery') {
    return clienteNombre ? `Delivery · ${clienteNombre}` : 'Delivery';
  }

  if (kind === 'takeaway') {
    return clienteNombre ? `Retiro · ${clienteNombre}` : 'Retiro / mostrador';
  }

  const mesa = mesasMap[pedido.mesa_id];

  if (mesa?.numero != null && mesa.numero > 0) {
    return `Mesa ${mesa.numero}`;
  }

  if (mesa?.nombre?.trim()) {
    return mesa.nombre.trim();
  }

  return `Mesa ID ${pedido.mesa_id}`;
}

function getPedidoKindBadge(pedido: Pedido) {
  const kind = getPedidoKind(pedido);

  if (kind === 'delivery') {
    return {
      text: 'DELIVERY',
      className:
        'bg-indigo-500/20 border border-indigo-400/40 text-indigo-100',
    };
  }

  if (kind === 'takeaway') {
    return {
      text: 'TAKE AWAY',
      className:
        'bg-amber-500/20 border border-amber-400/40 text-amber-100',
    };
  }

  return {
    text: 'SALÓN',
    className:
      'bg-emerald-500/20 border border-emerald-400/40 text-emerald-100',
  };
}

export default function CocinaPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [canUseWaiterMode, setCanUseWaiterMode] = useState(false);
  const [businessMode, setBusinessMode] = useState<BusinessMode>('restaurant');

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [mesasMap, setMesasMap] = useState<Record<number, MesaRef>>({});
  const [cargando, setCargando] = useState(true);
  const [destacados, setDestacados] = useState<number[]>([]);
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos');

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let active = true;

    async function verifyAccess() {
      try {
        const res = await fetch('/api/admin/session', {
          method: 'GET',
          cache: 'no-store',
        });

        if (!res.ok) {
          router.replace('/admin/login');
          return;
        }

        const data = await res.json().catch(() => null);
        const session = (data?.session as AdminSessionPayload | null) ?? null;

        if (!active) return;

        if (!session?.adminId) {
          router.replace('/admin/login');
          return;
        }

        setCanUseWaiterMode(!!session?.capabilities?.waiter_mode);
        setBusinessMode(
          normalizeBusinessMode(
            session?.business_mode ?? session?.restaurant?.business_mode
          )
        );
      } catch (error) {
        console.error('No se pudo verificar acceso a cocina', error);
        if (!active) return;
        router.replace('/admin/login');
      } finally {
        if (active) {
          setCheckingAccess(false);
        }
      }
    }

    verifyAccess();

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    audioRef.current = new Audio('/sounds/sonido.wav');
  }, []);

  const reproducirSonido = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {
      console.warn('No se pudo reproducir el sonido en cocina.');
    });
  };

  const cargarPedidos = async () => {
    setCargando(true);

    const [{ data: pedidosData, error: pedidosError }, { data: mesasData, error: mesasError }] =
      await Promise.all([
        supabase
          .from('pedidos')
          .select(`
            id,
            mesa_id,
            creado_en,
            estado,
            origen,
            tipo_servicio,
            codigo_publico,
            cliente_nombre,
            items_pedido (
              id,
              cantidad,
              comentarios,
              producto:productos ( nombre )
            )
          `)
          .in('estado', ['pendiente', 'en_preparacion', 'listo'])
          .order('creado_en', { ascending: true }),
        supabase
          .from('mesas')
          .select('id, numero, nombre'),
      ]);

    if (!pedidosError && pedidosData) {
      const formateados: Pedido[] = pedidosData.map((p: any) => ({
        id: p.id,
        mesa_id: p.mesa_id,
        creado_en: p.creado_en,
        estado: p.estado,
        items: p.items_pedido ?? [],
        origen: p.origen ?? null,
        tipo_servicio: p.tipo_servicio ?? null,
        codigo_publico: p.codigo_publico ?? null,
        cliente_nombre: p.cliente_nombre ?? null,
      }));
      setPedidos(formateados);
    }

    if (!mesasError && mesasData) {
      const map: Record<number, MesaRef> = {};
      for (const mesa of mesasData as MesaRef[]) {
        map[mesa.id] = mesa;
      }
      setMesasMap(map);
    }

    setCargando(false);
  };

  useEffect(() => {
    if (checkingAccess) return;

    cargarPedidos();

    const canalPedidos = supabase
      .channel('realtime-pedidos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos' },
        (payload) => {
          const nuevo: any = payload.new;
          const viejo: any = payload.old;

          const estadosCocina = ['pendiente', 'en_preparacion', 'listo'];

          if (payload.eventType === 'INSERT') {
            if (estadosCocina.includes(nuevo.estado)) {
              setDestacados((prev) => [...prev, nuevo.id]);
              reproducirSonido();
            }
          }

          if (payload.eventType === 'UPDATE') {
            if (
              estadosCocina.includes(nuevo.estado) &&
              viejo?.estado !== nuevo.estado &&
              nuevo.estado === 'pendiente'
            ) {
              setDestacados((prev) => [...prev, nuevo.id]);
              reproducirSonido();
            }
          }

          cargarPedidos();
        }
      )
      .subscribe();

    const canalItems = supabase
      .channel('realtime-items')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items_pedido' },
        () => {
          cargarPedidos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalPedidos);
      supabase.removeChannel(canalItems);
    };
  }, [checkingAccess]);

  const cambiarEstado = async (pedidoId: number, nuevoEstado: string) => {
    await supabase.from('pedidos').update({ estado: nuevoEstado }).eq('id', pedidoId);

    setDestacados((prev) => prev.filter((id) => id !== pedidoId));
  };

  const pedidosFiltrados = pedidos.filter((p) =>
    filtroEstado === 'todos' ? true : p.estado === filtroEstado
  );

  if (checkingAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-50">
        <p>Verificando acceso a cocina...</p>
      </main>
    );
  }

  if (cargando) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-50">
        <p>Cargando pedidos...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-900 text-slate-50 px-4 py-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Cocina (tiempo real)</h1>
            <p className="text-sm text-slate-300">
              Pedidos de salón, take away y delivery en una sola vista.
            </p>
            <p className="text-sm text-slate-400">
              En pedidos de salón se muestra el número visible de mesa, aunque la
              base use IDs internos para QR y navegación.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={cargarPedidos}
              className="px-3 py-1 rounded-lg text-sm bg-slate-800 border border-slate-600 hover:bg-slate-700"
            >
              Actualizar
            </button>

            <button
              onClick={() => router.push('/inicio')}
              className="px-3 py-1 rounded-lg text-sm bg-white text-slate-900 hover:bg-slate-100"
            >
              Volver a inicio
            </button>

            <button
              onClick={() => router.push('/admin')}
              className="px-3 py-1 rounded-lg text-sm bg-white text-slate-900 hover:bg-slate-100"
            >
              Ir a admin
            </button>

            {businessMode === 'restaurant' && canUseWaiterMode ? (
              <button
                onClick={() => router.push('/mozo/mesas')}
                className="px-3 py-1 rounded-lg text-sm bg-emerald-400 text-slate-900 font-semibold hover:bg-emerald-300"
              >
                Ir a mozo
              </button>
            ) : null}
          </div>
        </header>

        <div className="flex flex-wrap gap-2">
          {[
            { value: 'todos', label: 'Todos' },
            { value: 'pendiente', label: 'Pendientes' },
            { value: 'en_preparacion', label: 'En preparación' },
            { value: 'listo', label: 'Listos' },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setFiltroEstado(f.value as FiltroEstado)}
              className={`px-3 py-1 rounded-full text-sm border ${
                filtroEstado === f.value
                  ? 'bg-emerald-500 border-emerald-400 text-slate-900'
                  : 'bg-slate-800 border-slate-600 hover:bg-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {pedidosFiltrados.length === 0 && (
          <p className="text-slate-400">No hay pedidos para mostrar.</p>
        )}

        <section className="space-y-3">
          {pedidosFiltrados.map((p) => {
            const esNuevo = destacados.includes(p.id);
            const badge = getPedidoKindBadge(p);
            const pedidoLabel = getPedidoLabel(p, mesasMap);

            return (
              <article
                key={p.id}
                className={`rounded-xl border px-4 py-3 shadow-sm transition-all ${
                  esNuevo
                    ? 'border-amber-400 bg-amber-900/20 shadow-amber-500/40'
                    : 'border-slate-700 bg-slate-800'
                }`}
              >
                <header className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.className}`}
                    >
                      {badge.text}
                    </span>

                    <h3 className="font-semibold">
                      {p.codigo_publico || `Pedido #${p.id}`}
                    </h3>
                  </div>

                  <div className="text-xs text-slate-300">
                    Hora: {new Date(p.creado_en).toLocaleTimeString()}
                    {' · '}
                    Estado:{' '}
                    <span className="font-semibold">
                      {p.estado === 'pendiente'
                        ? 'Pendiente'
                        : p.estado === 'en_preparacion'
                        ? 'En preparación'
                        : 'Listo'}
                    </span>
                  </div>
                </header>

                <p className="mt-1 text-sm text-slate-300">{pedidoLabel}</p>

                <ul className="mt-2 space-y-1 text-sm">
                  {p.items.map((item) => (
                    <li key={item.id}>
                      <span className="font-medium">
                        {item.cantidad} × {item.producto?.nombre ?? '—'}
                      </span>
                      {item.comentarios && (
                        <p className="text-xs text-amber-200 ml-4">
                          Nota: {item.comentarios}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex flex-wrap gap-2">
                  {p.estado === 'pendiente' && (
                    <button
                      onClick={() => cambiarEstado(p.id, 'en_preparacion')}
                      className="px-3 py-1 rounded-lg bg-sky-500 text-slate-900 text-sm font-semibold hover:bg-sky-400"
                    >
                      Tomar pedido
                    </button>
                  )}
                  {p.estado === 'en_preparacion' && (
                    <button
                      onClick={() => cambiarEstado(p.id, 'listo')}
                      className="px-3 py-1 rounded-lg bg-emerald-500 text-slate-900 text-sm font-semibold hover:bg-emerald-400"
                    >
                      Marcar listo
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}