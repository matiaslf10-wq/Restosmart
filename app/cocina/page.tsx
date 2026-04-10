'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
  normalizeBusinessMode,
  type BusinessMode,
} from '@/lib/plans';

const DELIVERY_MESA_ID = 0;

type KitchenPrepState = 'pendiente' | 'en_preparacion' | 'listo';
type PrepTarget = 'mostrador' | 'cocina';

type ItemPedido = {
  id: number;
  cantidad: number;
  comentarios: string | null;
  comentarioVisible: string | null;
  prepTarget: PrepTarget;
  kitchenState: KitchenPrepState | null;
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
    origen === 'takeaway_manual_mostrador' ||
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

function parseKitchenMeta(comment: string | null | undefined) {
  const raw = String(comment ?? '').trim();

  if (!raw) {
    return {
      prepTarget: 'mostrador' as PrepTarget,
      kitchenState: null as KitchenPrepState | null,
      comentarioVisible: null as string | null,
    };
  }

  const match = raw.match(
    /^\[\[COCINA:(pendiente|en_preparacion|listo)\]\]\s*(.*)$/i
  );

  if (!match) {
    return {
      prepTarget: 'mostrador' as PrepTarget,
      kitchenState: null,
      comentarioVisible: raw,
    };
  }

  const visible = String(match[2] ?? '').trim();

  return {
    prepTarget: 'cocina' as PrepTarget,
    kitchenState: match[1].toLowerCase() as KitchenPrepState,
    comentarioVisible: visible || null,
  };
}

function buildKitchenComment(
  comment: string | null | undefined,
  kitchenState: KitchenPrepState
) {
  const visible = String(comment ?? '').trim();
  return `[[COCINA:${kitchenState}]]${visible ? ` ${visible}` : ''}`;
}

function getKitchenItems(pedido: Pedido) {
  return pedido.items.filter((item) => item.prepTarget === 'cocina');
}

function getReadyMessage(params: {
  pedido: Pedido;
  businessMode: BusinessMode;
  canUseWaiterMode: boolean;
}) {
  const { pedido, businessMode, canUseWaiterMode } = params;
  const kind = getPedidoKind(pedido);

  if (kind === 'takeaway') {
    return 'Los ítems de cocina ya están listos. Ahora Mostrador / Caja debe entregarlo y marcarlo como entregado.';
  }

  if (kind === 'delivery') {
    return 'Los ítems de cocina ya están listos. Ahora la operación del local debe despacharlo o entregarlo.';
  }

  if (businessMode === 'restaurant' && canUseWaiterMode) {
    return 'Los ítems de cocina ya están listos. El mozo ya puede verlo en su pantalla para retirarlo y llevarlo a la mesa.';
  }

  return 'Los ítems de cocina ya están listos. Ahora Caja / Salón debe verlo desde Mostrador para entregarlo o cerrar la cuenta cuando corresponda.';
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
  const [error, setError] = useState<string | null>(null);
  const [audioReady, setAudioReady] = useState(false);
  const [actualizandoPedidoId, setActualizandoPedidoId] = useState<number | null>(
    null
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioReadyRef = useRef(false);

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
      } catch (err) {
        console.error('No se pudo verificar acceso a cocina', err);
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

  const enableAudio = useCallback(async () => {
    const audio = audioRef.current;

    if (!audio || audioReadyRef.current) return;

    try {
      audio.volume = 0;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 1;

      audioReadyRef.current = true;
      setAudioReady(true);
    } catch (err) {
      console.warn('No se pudo activar el sonido en cocina.', err);
    }
  }, []);

  useEffect(() => {
    const audio = new Audio('/sounds/sonido.wav');
    audio.preload = 'auto';
    audioRef.current = audio;

    const handleFirstInteraction = () => {
      void enableAudio();
    };

    window.addEventListener('pointerdown', handleFirstInteraction, {
      passive: true,
    });
    window.addEventListener('keydown', handleFirstInteraction);

    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);

      audio.pause();
      audioRef.current = null;
      audioReadyRef.current = false;
    };
  }, [enableAudio]);

  const reproducirSonido = useCallback(() => {
    const audio = audioRef.current;

    if (!audio) return;
    if (!audioReadyRef.current) return;

    audio.currentTime = 0;
    audio.play().catch((err) => {
      console.warn('No se pudo reproducir el sonido en cocina.', err);
    });
  }, []);

  const cargarPedidos = useCallback(async () => {
    setCargando(true);
    setError(null);

    const [
      { data: pedidosData, error: pedidosError },
      { data: mesasData, error: mesasError },
    ] = await Promise.all([
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
        .order('creado_en', { ascending: false }),
      supabase.from('mesas').select('id, numero, nombre'),
    ]);

    if (pedidosError) {
      console.error('Error cargando pedidos en cocina:', pedidosError);
      setError('No se pudieron cargar los pedidos de cocina.');
      setPedidos([]);
    } else if (pedidosData) {
      const formateados: Pedido[] = (pedidosData as any[])
        .map((p) => {
          const items: ItemPedido[] = ((p.items_pedido ?? []) as any[]).map(
            (item) => {
              const parsed = parseKitchenMeta(item.comentarios);

              return {
                id: item.id,
                cantidad: item.cantidad,
                comentarios: item.comentarios ?? null,
                comentarioVisible: parsed.comentarioVisible,
                prepTarget: parsed.prepTarget,
                kitchenState: parsed.kitchenState,
                producto: item.producto ?? null,
              };
            }
          );

          return {
            id: p.id,
            mesa_id: p.mesa_id,
            creado_en: p.creado_en,
            estado: p.estado,
            items,
            origen: p.origen ?? null,
            tipo_servicio: p.tipo_servicio ?? null,
            codigo_publico: p.codigo_publico ?? null,
            cliente_nombre: p.cliente_nombre ?? null,
          };
        })
        .filter((pedido) => getKitchenItems(pedido).length > 0);

      setPedidos(formateados);
    }

    if (mesasError) {
      console.error('Error cargando mesas en cocina:', mesasError);
    } else if (mesasData) {
      const map: Record<number, MesaRef> = {};
      for (const mesa of mesasData as MesaRef[]) {
        map[mesa.id] = mesa;
      }
      setMesasMap(map);
    }

    setCargando(false);
  }, []);

  useEffect(() => {
    if (checkingAccess) return;

    void cargarPedidos();

    const canalPedidos = supabase
      .channel('realtime-pedidos-cocina')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos' },
        () => {
          void cargarPedidos();
        }
      )
      .subscribe();

    const canalItems = supabase
      .channel('realtime-items-cocina')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items_pedido' },
        (payload) => {
          const nuevo = payload.new as any;
          const viejo = payload.old as any;

          const parsedNuevo = parseKitchenMeta(nuevo?.comentarios ?? null);
          const parsedViejo = parseKitchenMeta(viejo?.comentarios ?? null);

          const ingresoNuevoAPendiente =
            parsedNuevo.prepTarget === 'cocina' &&
            parsedNuevo.kitchenState === 'pendiente' &&
            !(
              parsedViejo.prepTarget === 'cocina' &&
              parsedViejo.kitchenState === 'pendiente'
            );

          if (ingresoNuevoAPendiente && Number.isFinite(Number(nuevo?.pedido_id))) {
            const pedidoId = Number(nuevo.pedido_id);

            setDestacados((prev) =>
              prev.includes(pedidoId) ? prev : [pedidoId, ...prev]
            );
            reproducirSonido();
          }

          void cargarPedidos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalPedidos);
      supabase.removeChannel(canalItems);
    };
  }, [checkingAccess, cargarPedidos, reproducirSonido]);

  const actualizarEstadoItemsCocina = async (
    pedido: Pedido,
    nuevoEstado: 'en_preparacion' | 'listo'
  ) => {
    setActualizandoPedidoId(pedido.id);
    setError(null);

    try {
      const kitchenItems = getKitchenItems(pedido);

      const itemsAActualizar = kitchenItems.filter((item) => {
        if (nuevoEstado === 'en_preparacion') {
          return item.kitchenState === 'pendiente';
        }

        return (
          item.kitchenState === 'pendiente' ||
          item.kitchenState === 'en_preparacion'
        );
      });

      if (itemsAActualizar.length === 0) {
        setActualizandoPedidoId(null);
        return;
      }

      const updates = await Promise.all(
        itemsAActualizar.map((item) =>
          supabase
            .from('items_pedido')
            .update({
              comentarios: buildKitchenComment(
                item.comentarioVisible,
                nuevoEstado
              ),
            })
            .eq('id', item.id)
        )
      );

      const failed = updates.find((result) => result.error);

      if (failed?.error) {
        throw failed.error;
      }

      const { error: pedidoError } = await supabase
        .from('pedidos')
        .update({
          estado: nuevoEstado === 'listo' ? 'listo' : 'en_preparacion',
        })
        .eq('id', pedido.id);

      if (pedidoError) {
        throw pedidoError;
      }

      setDestacados((prev) => prev.filter((id) => id !== pedido.id));
      await cargarPedidos();
    } catch (err) {
      console.error('No se pudo actualizar el estado del pedido en cocina:', err);
      setError('No se pudo actualizar el estado del pedido en cocina.');
    } finally {
      setActualizandoPedidoId(null);
    }
  };

  const pedidosFiltrados = [...pedidos]
    .filter((p) => (filtroEstado === 'todos' ? true : p.estado === filtroEstado))
    .sort((a, b) => {
      const timeA = new Date(a.creado_en).getTime();
      const timeB = new Date(b.creado_en).getTime();

      if (timeA !== timeB) return timeB - timeA;
      return b.id - a.id;
    });

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
              Cocina ve solo los ítems que Mostrador le envía.
            </p>
            <p className="text-sm text-slate-400">
              Cuando cocina deja esos ítems en <strong>listo</strong>, Mostrador /
              Caja se encarga de la entrega final.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                void enableAudio();
              }}
              className={`px-3 py-1 rounded-lg text-sm border ${
                audioReady
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-100'
                  : 'bg-amber-500/20 border-amber-400 text-amber-100 hover:bg-amber-500/30'
              }`}
            >
              {audioReady ? 'Sonido activo' : 'Activar sonido'}
            </button>

            <button
              onClick={() => {
                void cargarPedidos();
              }}
              className="px-3 py-1 rounded-lg text-sm bg-slate-800 border border-slate-600 hover:bg-slate-700"
            >
              Actualizar
            </button>

            <button
              onClick={() => router.push('/mostrador')}
              className="px-3 py-1 rounded-lg text-sm bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300"
            >
              Ir a mostrador
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

        {!audioReady ? (
          <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Para volver a escuchar el aviso de ingreso de ítems a cocina, hacé click
            en <strong> “Activar sonido”</strong>.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

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
          <p className="text-slate-400">No hay ítems de cocina para mostrar.</p>
        )}

        <section className="space-y-3">
          {pedidosFiltrados.map((p) => {
            const esNuevo = destacados.includes(p.id);
            const badge = getPedidoKindBadge(p);
            const pedidoLabel = getPedidoLabel(p, mesasMap);
            const kind = getPedidoKind(p);
            const clienteNombre = getClienteNombre(p);

            const kitchenItems = getKitchenItems(p);
            const hasPendingKitchen = kitchenItems.some(
              (item) => item.kitchenState === 'pendiente'
            );
            const hasPreparingKitchen = kitchenItems.some(
              (item) => item.kitchenState === 'en_preparacion'
            );
            const allKitchenReady =
              kitchenItems.length > 0 &&
              kitchenItems.every((item) => item.kitchenState === 'listo');

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

                {kind !== 'salon' && clienteNombre ? (
                  <p className="mt-1 text-sm font-semibold text-white">
                    Cliente: {clienteNombre}
                  </p>
                ) : null}

                <ul className="mt-2 space-y-2 text-sm">
                  {kitchenItems.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <span className="font-medium">
                            {item.cantidad} × {item.producto?.nombre ?? '—'}
                          </span>

                          {item.comentarioVisible ? (
                            <p className="text-xs text-amber-200 mt-1">
                              Nota: {item.comentarioVisible}
                            </p>
                          ) : null}
                        </div>

                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            item.kitchenState === 'listo'
                              ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-100'
                              : item.kitchenState === 'en_preparacion'
                              ? 'bg-sky-500/20 border border-sky-400/40 text-sky-100'
                              : 'bg-amber-500/20 border border-amber-400/40 text-amber-100'
                          }`}
                        >
                          {item.kitchenState === 'listo'
                            ? 'Listo en cocina'
                            : item.kitchenState === 'en_preparacion'
                            ? 'En preparación'
                            : 'Pendiente'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex flex-wrap gap-2">
                  {hasPendingKitchen ? (
                    <button
                      onClick={() => {
                        void actualizarEstadoItemsCocina(p, 'en_preparacion');
                      }}
                      disabled={actualizandoPedidoId === p.id}
                      className="px-3 py-1 rounded-lg bg-sky-500 text-slate-900 text-sm font-semibold hover:bg-sky-400 disabled:opacity-60"
                    >
                      {actualizandoPedidoId === p.id
                        ? 'Actualizando...'
                        : 'Tomar pedido'}
                    </button>
                  ) : null}

                  {(hasPendingKitchen || hasPreparingKitchen) && !allKitchenReady ? (
                    <button
                      onClick={() => {
                        void actualizarEstadoItemsCocina(p, 'listo');
                      }}
                      disabled={actualizandoPedidoId === p.id}
                      className="px-3 py-1 rounded-lg bg-emerald-500 text-slate-900 text-sm font-semibold hover:bg-emerald-400 disabled:opacity-60"
                    >
                      {actualizandoPedidoId === p.id
                        ? 'Actualizando...'
                        : 'Marcar listo'}
                    </button>
                  ) : null}
                </div>

                {allKitchenReady ? (
                  <p className="mt-3 text-xs text-slate-400">
                    {getReadyMessage({
                      pedido: p,
                      businessMode,
                      canUseWaiterMode,
                    })}
                  </p>
                ) : null}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}