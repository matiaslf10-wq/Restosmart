'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { formatPlanLabel, type PlanCode } from '@/lib/plans';

type KitchenPrepState = 'pendiente' | 'en_preparacion' | 'listo';
type PrepTarget = 'mostrador' | 'cocina';

type ItemPedido = {
  id: number;
  cantidad: number;
  comentarios: string | null;
  comentarioVisible: string | null;
  prepTarget: PrepTarget;
  kitchenState: KitchenPrepState | null;
  producto: {
    nombre: string;
    precio: number | null;
  } | null;
};

type Pedido = {
  id: number;
  mesa_id: number;
  creado_en: string;
  estado: string;
  paga_efectivo?: boolean;
  items: ItemPedido[];
};

type EstadoMesaView = 'sin_pedidos' | 'en_curso' | 'lista_para_caja';

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function formatEstadoLabel(estado: string) {
  const normalized = normalizeText(estado);

  if (normalized === 'solicitado') return 'Solicitado';
  if (normalized === 'pendiente') return 'Pendiente';
  if (normalized === 'en_preparacion') return 'En preparación';
  if (normalized === 'listo') return 'Listo';

  return estado || 'Sin estado';
}

function getEstadoBadgeClass(estado: string) {
  const normalized = normalizeText(estado);

  if (normalized === 'listo') {
    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  }

  if (normalized === 'en_preparacion') {
    return 'bg-sky-100 text-sky-800 border-sky-200';
  }

  if (normalized === 'pendiente' || normalized === 'solicitado') {
    return 'bg-amber-100 text-amber-800 border-amber-200';
  }

  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function getMesaEstado(pedidos: Pedido[]): EstadoMesaView {
  if (pedidos.length === 0) return 'sin_pedidos';

  const hayEnCurso = pedidos.some((pedido) => {
    const estado = normalizeText(pedido.estado);
    return (
      estado === 'solicitado' ||
      estado === 'pendiente' ||
      estado === 'en_preparacion'
    );
  });

  if (hayEnCurso) return 'en_curso';

  return 'lista_para_caja';
}

function getMesaEstadoBadgeClass(estado: EstadoMesaView) {
  if (estado === 'lista_para_caja') {
    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  }

  if (estado === 'en_curso') {
    return 'bg-amber-100 text-amber-800 border-amber-200';
  }

  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function getMesaEstadoLabel(estado: EstadoMesaView) {
  if (estado === 'lista_para_caja') return 'Lista para pasar a caja';
  if (estado === 'en_curso') return 'En curso';
  return 'Sin pedidos';
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

export default function MozoMesaPage() {
  const params = useParams();
  const router = useRouter();
  const mesaId = Number((params as { mesaId?: string }).mesaId);

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [canUseWaiterMode, setCanUseWaiterMode] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<PlanCode>('esencial');

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [derivandoACaja, setDerivandoACaja] = useState(false);
  const [actualizandoPedidoId, setActualizandoPedidoId] = useState<number | null>(
    null
  );
  const [actualizandoItemId, setActualizandoItemId] = useState<number | null>(
    null
  );

  const cargarPedidos = useCallback(async () => {
    if (!mesaId) return;

    setCargando(true);
    setMensaje(null);

    const { data, error } = await supabase
      .from('pedidos')
      .select(`
        id,
        mesa_id,
        creado_en,
        estado,
        paga_efectivo,
        items_pedido (
          id,
          cantidad,
          comentarios,
          producto:productos ( nombre, precio )
        )
      `)
      .eq('mesa_id', mesaId)
      .in('estado', ['solicitado', 'pendiente', 'en_preparacion', 'listo'])
      .order('creado_en', { ascending: true });

    if (error) {
      console.error('Error al cargar pedidos de la mesa:', error);
      setMensaje('No se pudo cargar la mesa.');
      setPedidos([]);
      setCargando(false);
      return;
    }

    if (data) {
      const formateados: Pedido[] = data.map((p: any) => ({
        id: p.id,
        mesa_id: p.mesa_id,
        creado_en: p.creado_en,
        estado: p.estado,
        paga_efectivo: p.paga_efectivo,
        items: (p.items_pedido ?? []).map((item: any) => {
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
        }),
      }));

      setPedidos(formateados);
    } else {
      setPedidos([]);
    }

    setCargando(false);
  }, [mesaId]);

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
        const session = data?.session;

        if (!active) return;

        const plan = (session?.plan ?? 'esencial') as PlanCode;
        const enabled = !!session?.capabilities?.waiter_mode;

        setCurrentPlan(plan);
        setCanUseWaiterMode(enabled);
      } catch (error) {
        console.error('No se pudo verificar acceso a mozo/mesa', error);
        if (!active) return;
        setCanUseWaiterMode(false);
      } finally {
        if (active) {
          setCheckingAccess(false);
        }
      }
    }

    void verifyAccess();

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!canUseWaiterMode || !mesaId) return;

    void cargarPedidos();

    const interval = setInterval(() => {
      void cargarPedidos();
    }, 10000);

    return () => clearInterval(interval);
  }, [canUseWaiterMode, mesaId, cargarPedidos]);

  const subtotalPedido = (pedido: Pedido) =>
    pedido.items.reduce((acc, item) => {
      const precio = item.producto?.precio ?? 0;
      return acc + item.cantidad * precio;
    }, 0);

  const totalMesa = pedidos.reduce(
    (acc, pedido) => acc + subtotalPedido(pedido),
    0
  );

  const estadoMesa = useMemo(() => getMesaEstado(pedidos), [pedidos]);

  const actualizarEstadoPedido = async (
    pedidoId: number,
    nuevoEstado: 'pendiente'
  ) => {
    setActualizandoPedidoId(pedidoId);
    setMensaje(null);

    const { error } = await supabase
      .from('pedidos')
      .update({ estado: nuevoEstado })
      .eq('id', pedidoId);

    if (error) {
      console.error('Error al actualizar estado del pedido:', error);
      setMensaje('No se pudo actualizar el estado del pedido.');
      setActualizandoPedidoId(null);
      return;
    }

    setActualizandoPedidoId(null);
    await cargarPedidos();
  };

  const enviarItemACocina = async (pedidoId: number, item: ItemPedido) => {
    setActualizandoItemId(item.id);
    setMensaje(null);

    const { error: itemError } = await supabase
      .from('items_pedido')
      .update({
        comentarios: buildKitchenComment(item.comentarioVisible, 'pendiente'),
      })
      .eq('id', item.id);

    if (itemError) {
      console.error('No se pudo enviar el ítem a cocina:', itemError);
      setMensaje('No se pudo enviar el ítem a cocina.');
      setActualizandoItemId(null);
      return;
    }

    const { error: pedidoError } = await supabase
      .from('pedidos')
      .update({ estado: 'en_preparacion' })
      .eq('id', pedidoId);

    if (pedidoError) {
      console.error(
        'No se pudo actualizar el pedido al enviar ítem a cocina:',
        pedidoError
      );
      setMensaje('No se pudo actualizar el pedido al enviar el ítem a cocina.');
      setActualizandoItemId(null);
      return;
    }

    setActualizandoItemId(null);
    setMensaje(`Ítem enviado a cocina en el pedido #${pedidoId}.`);
    await cargarPedidos();
  };

  const pasarACaja = async () => {
    if (!mesaId) return;

    setDerivandoACaja(true);
    setMensaje(null);

    router.push(`/mostrador?focusMesaId=${mesaId}`);
  };

  if (checkingAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>Verificando acceso al modo mozo…</p>
      </main>
    );
  }

  if (!canUseWaiterMode) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-3xl border border-blue-200 bg-white p-8 shadow-sm">
            <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
              Disponible desde Pro
            </span>

            <h1 className="mt-4 text-3xl font-bold text-slate-900">
              Vista de mozo por mesa
            </h1>

            <p className="mt-3 text-slate-600 leading-relaxed">
              Tu plan actual es <strong>{formatPlanLabel(currentPlan)}</strong>.
              Esta funcionalidad forma parte del modo mozo, disponible desde
              <strong> Pro</strong>.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="/#precios"
                className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Ver planes
              </a>
              <button
                onClick={() => router.push('/admin')}
                className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Volver al admin
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!mesaId) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>Falta el número de mesa en la URL.</p>
      </main>
    );
  }

  if (cargando) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>Cargando mesa...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  MOZO · SALÓN
                </span>

                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getMesaEstadoBadgeClass(
                    estadoMesa
                  )}`}
                >
                  {getMesaEstadoLabel(estadoMesa)}
                </span>
              </div>

              <h1 className="mt-3 text-3xl font-bold text-slate-900">
                Mesa {mesaId}
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                Esta vista queda enfocada en atención del salón: seguimiento de
                pedidos, toma inicial del pedido, envío de ítems a cocina y derivación
                a caja. El cobro y el cierre real se resuelven desde mostrador.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  void cargarPedidos();
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Actualizar
              </button>

              <button
                onClick={() => router.push('/mozo/mesas')}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Volver a mesas
              </button>
            </div>
          </div>
        </header>

        {mensaje ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {mensaje}
          </div>
        ) : null}

        {pedidos.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-600 shadow-sm">
            No hay pedidos activos para esta mesa.
          </div>
        ) : (
          <>
            <section className="space-y-3">
              {pedidos.map((pedido) => (
                <article
                  key={pedido.id}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
                >
                  <header className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-slate-900">
                          Pedido #{pedido.id}
                        </h2>

                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getEstadoBadgeClass(
                            pedido.estado
                          )}`}
                        >
                          {formatEstadoLabel(pedido.estado)}
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-slate-500">
                        Creado a las {formatTime(pedido.creado_en)}
                      </p>
                    </div>

                    <p className="text-right text-base font-bold text-slate-900">
                      {formatMoney(subtotalPedido(pedido))}
                    </p>
                  </header>

                  <ul className="mt-4 space-y-2">
                    {pedido.items.map((item) => (
                      <li
                        key={item.id}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-slate-900">
                                {item.cantidad} × {item.producto?.nombre ?? 'Producto'}
                              </p>

                              <span
                                className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                                  item.prepTarget === 'cocina'
                                    ? item.kitchenState === 'listo'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : item.kitchenState === 'en_preparacion'
                                      ? 'bg-sky-100 text-sky-800'
                                      : 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {item.prepTarget === 'cocina'
                                  ? item.kitchenState === 'listo'
                                    ? 'Listo cocina'
                                    : item.kitchenState === 'en_preparacion'
                                    ? 'Preparando'
                                    : 'Enviado'
                                  : 'Mostrador'}
                              </span>
                            </div>

                            {item.comentarioVisible ? (
                              <p className="mt-1 text-xs text-slate-600">
                                Nota: {item.comentarioVisible}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            <p className="text-sm font-semibold text-slate-700">
                              {formatMoney((item.producto?.precio ?? 0) * item.cantidad)}
                            </p>

                            {item.prepTarget === 'mostrador' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  void enviarItemACocina(pedido.id, item);
                                }}
                                disabled={actualizandoItemId === item.id}
                                className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                              >
                                {actualizandoItemId === item.id
                                  ? 'Enviando...'
                                  : 'A cocina'}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">
                      {normalizeText(pedido.estado) === 'solicitado'
                        ? 'Todavía no fue tomado por mozo.'
                        : normalizeText(pedido.estado) === 'pendiente'
                        ? 'Pedido tomado. A la espera de preparación / avance.'
                        : normalizeText(pedido.estado) === 'en_preparacion'
                        ? 'El pedido está en preparación.'
                        : 'El pedido ya quedó listo.'}
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {normalizeText(pedido.estado) === 'solicitado' ? (
                        <button
                          onClick={() => {
                            void actualizarEstadoPedido(pedido.id, 'pendiente');
                          }}
                          disabled={actualizandoPedidoId === pedido.id}
                          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {actualizandoPedidoId === pedido.id
                            ? 'Tomando...'
                            : 'Tomar pedido'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </section>

            <footer className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total activo de la mesa</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {formatMoney(totalMesa)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={pasarACaja}
                    disabled={derivandoACaja}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {derivandoACaja ? 'Abriendo caja...' : 'Pasar a caja'}
                  </button>
                </div>
              </div>

              <p className="mt-3 text-xs text-slate-500">
                Desde mozo ya no se cobra ni se cierra la cuenta. Esta vista queda
                enfocada en atención del salón.
              </p>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}