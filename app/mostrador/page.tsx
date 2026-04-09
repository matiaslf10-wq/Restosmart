'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
  formatBusinessModeLabel,
  formatPlanLabel,
  normalizeBusinessMode,
  type BusinessMode,
  type PlanCode,
} from '@/lib/plans';

const DELIVERY_MESA_ID = 0;

type Pedido = {
  id: number;
  mesa_id: number;
  creado_en: string;
  estado: string;
  total: number | string | null;
  codigo_publico?: string | null;
  origen?: string | null;
  tipo_servicio?: string | null;
  cliente_nombre?: string | null;
  medio_pago?: string | null;
  estado_pago?: string | null;
  forma_pago?: 'efectivo' | 'virtual' | null;
  paga_efectivo?: boolean | null;
  efectivo_aprobado?: boolean | null;
};

type MesaRef = {
  id: number;
  numero: number | null;
  nombre: string | null;
};

type PedidoKind = 'salon' | 'takeaway' | 'delivery';

type AdminSessionPayload = {
  adminId?: string;
  plan?: PlanCode;
  business_mode?: BusinessMode;
  capabilities?: {
    waiter_mode?: boolean;
  };
  restaurant?: {
    business_mode?: BusinessMode;
  } | null;
};

type MesaActiva = {
  id: number;
  numero: number | null;
  nombre: string;
  pedidos: Pedido[];
  totalMesa: number;
};

function formatMoney(value: number | string | null | undefined) {
  const num = Number(value ?? 0);

  if (!Number.isFinite(num)) return '$0';

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(num);
}

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
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

function isDeliveryPedido(pedido: Pedido) {
  const tipo = normalizeText(pedido.tipo_servicio);
  const origen = normalizeText(pedido.origen);

  return (
    pedido.mesa_id === DELIVERY_MESA_ID ||
    tipo === 'delivery' ||
    tipo === 'envio' ||
    origen === 'delivery' ||
    origen === 'delivery_whatsapp' ||
    origen === 'delivery_manual'
  );
}

function isTakeawayPedido(pedido: Pedido) {
  const tipo = normalizeText(pedido.tipo_servicio);
  const origen = normalizeText(pedido.origen);

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
  return 'salon';
}

function getMesaDisplayName(mesa: MesaActiva | { numero: number | null; nombre: string }) {
  if (mesa.numero != null && mesa.numero > 0) {
    return `Mesa ${mesa.numero}`;
  }

  return mesa.nombre;
}

function getTakeawayLabel(pedido: Pedido) {
  const cliente = String(pedido.cliente_nombre ?? '').trim();
  return cliente || 'Cliente sin nombre';
}

function getPaymentBadge(pedido: Pedido) {
  const raw = normalizeText(
    pedido.medio_pago ?? pedido.forma_pago ?? (pedido.paga_efectivo ? 'efectivo' : '')
  );

  if (raw === 'efectivo') {
    return {
      label: '💵 Efectivo',
      className:
        'bg-emerald-100 text-emerald-800 border-emerald-200',
    };
  }

  if (raw === 'virtual') {
    return {
      label: '💳 Virtual',
      className:
        'bg-indigo-100 text-indigo-800 border-indigo-200',
    };
  }

  return {
    label: 'Pago sin definir',
    className:
      'bg-slate-100 text-slate-700 border-slate-200',
  };
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

function formatEstadoLabel(estado: string) {
  const normalized = normalizeText(estado);

  if (normalized === 'solicitado') return 'Solicitado';
  if (normalized === 'pendiente') return 'Pendiente';
  if (normalized === 'en_preparacion') return 'En preparación';
  if (normalized === 'listo') return 'Listo';
  if (normalized === 'entregado') return 'Entregado';
  if (normalized === 'cerrado') return 'Cerrado';

  return estado || 'Sin estado';
}

function calcularEstadoMesa(mesa: MesaActiva) {
  if (mesa.pedidos.length === 0) return 'libre';

  const hayEnCurso = mesa.pedidos.some((p) => {
    const estado = normalizeText(p.estado);
    return (
      estado === 'solicitado' ||
      estado === 'pendiente' ||
      estado === 'en_preparacion'
    );
  });

  if (hayEnCurso) return 'en_curso';

  return 'lista';
}

function getMesaEstadoBadge(estado: 'libre' | 'en_curso' | 'lista') {
  if (estado === 'lista') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Lista para entregar / cobrar
      </span>
    );
  }

  if (estado === 'en_curso') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        En curso
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
      <span className="h-2 w-2 rounded-full bg-slate-400" />
      Libre
    </span>
  );
}

export default function MostradorPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [currentPlan, setCurrentPlan] = useState<PlanCode>('esencial');
  const [businessMode, setBusinessMode] = useState<BusinessMode>('restaurant');
  const [canUseWaiterMode, setCanUseWaiterMode] = useState(false);

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [mesasMap, setMesasMap] = useState<Record<number, MesaRef>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [actualizandoPedidoId, setActualizandoPedidoId] = useState<number | null>(null);
  const [cerrandoMesaId, setCerrandoMesaId] = useState<number | null>(null);

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

        setCurrentPlan((session?.plan ?? 'esencial') as PlanCode);
        setCanUseWaiterMode(!!session?.capabilities?.waiter_mode);
        setBusinessMode(
          normalizeBusinessMode(
            session?.business_mode ?? session?.restaurant?.business_mode
          )
        );
      } catch (err) {
        console.error('No se pudo verificar acceso a mostrador', err);
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

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError(null);

    const [
      { data: pedidosData, error: pedidosError },
      { data: mesasData, error: mesasError },
    ] = await Promise.all([
      supabase
        .from('pedidos')
        .select(
          `
            id,
            mesa_id,
            creado_en,
            estado,
            total,
            codigo_publico,
            origen,
            tipo_servicio,
            cliente_nombre,
            medio_pago,
            estado_pago,
            forma_pago,
            paga_efectivo,
            efectivo_aprobado
          `
        )
        .in('estado', ['solicitado', 'pendiente', 'en_preparacion', 'listo'])
        .order('creado_en', { ascending: false }),
      supabase.from('mesas').select('id, numero, nombre'),
    ]);

    if (pedidosError) {
      console.error('Error cargando pedidos en mostrador:', pedidosError);
      setError('No se pudieron cargar los pedidos de mostrador.');
      setPedidos([]);
    } else {
      const formateados: Pedido[] = ((pedidosData ?? []) as any[]).map((p) => ({
        id: p.id,
        mesa_id: p.mesa_id,
        creado_en: p.creado_en,
        estado: p.estado,
        total: p.total ?? 0,
        codigo_publico: p.codigo_publico ?? null,
        origen: p.origen ?? null,
        tipo_servicio: p.tipo_servicio ?? null,
        cliente_nombre: p.cliente_nombre ?? null,
        medio_pago: p.medio_pago ?? null,
        estado_pago: p.estado_pago ?? null,
        forma_pago: p.forma_pago ?? null,
        paga_efectivo: p.paga_efectivo ?? null,
        efectivo_aprobado: p.efectivo_aprobado ?? null,
      }));

      setPedidos(formateados);
    }

    if (mesasError) {
      console.error('Error cargando mesas en mostrador:', mesasError);
    } else {
      const map: Record<number, MesaRef> = {};
      for (const mesa of (mesasData as MesaRef[]) ?? []) {
        map[mesa.id] = mesa;
      }
      setMesasMap(map);
    }

    setCargando(false);
  }, []);

  useEffect(() => {
    if (checkingAccess) return;

    void cargarDatos();

    const interval = setInterval(() => {
      void cargarDatos();
    }, 10000);

    return () => clearInterval(interval);
  }, [checkingAccess, cargarDatos]);

  const pedidosLocal = useMemo(
    () => pedidos.filter((pedido) => getPedidoKind(pedido) !== 'delivery'),
    [pedidos]
  );

  const takeawayPedidos = useMemo(
    () =>
      pedidosLocal.filter((pedido) => getPedidoKind(pedido) === 'takeaway'),
    [pedidosLocal]
  );

  const mesasSalonActivas = useMemo<MesaActiva[]>(() => {
    const pedidosSalon = pedidosLocal.filter(
      (pedido) => getPedidoKind(pedido) === 'salon'
    );

    const grouped = new Map<number, Pedido[]>();

    for (const pedido of pedidosSalon) {
      if (!grouped.has(pedido.mesa_id)) {
        grouped.set(pedido.mesa_id, []);
      }

      grouped.get(pedido.mesa_id)!.push(pedido);
    }

    return Array.from(grouped.entries())
      .map(([mesaId, pedidosMesa]) => {
        const mesaRef = mesasMap[mesaId];

        const totalMesa = pedidosMesa.reduce(
          (acc, pedido) => acc + Number(pedido.total ?? 0),
          0
        );

        return {
          id: mesaId,
          numero: mesaRef?.numero ?? null,
          nombre: mesaRef?.nombre?.trim() || `Mesa ID ${mesaId}`,
          pedidos: pedidosMesa.sort((a, b) => {
            const timeA = new Date(a.creado_en).getTime();
            const timeB = new Date(b.creado_en).getTime();
            return timeA - timeB;
          }),
          totalMesa,
        };
      })
      .sort((a, b) => {
        const aNumero = a.numero ?? Number.MAX_SAFE_INTEGER;
        const bNumero = b.numero ?? Number.MAX_SAFE_INTEGER;

        if (aNumero !== bNumero) return aNumero - bNumero;
        return a.id - b.id;
      });
  }, [mesasMap, pedidosLocal]);

  const takeawayResumen = useMemo(() => {
    return takeawayPedidos.reduce(
      (acc, pedido) => {
        const estado = normalizeText(pedido.estado);

        if (estado === 'listo') {
          acc.listos += 1;
        } else {
          acc.enCurso += 1;
        }

        return acc;
      },
      { enCurso: 0, listos: 0 }
    );
  }, [takeawayPedidos]);

  const salonResumen = useMemo(() => {
    return mesasSalonActivas.reduce(
      (acc, mesa) => {
        const estado = calcularEstadoMesa(mesa);

        if (estado === 'lista') {
          acc.listas += 1;
        } else if (estado === 'en_curso') {
          acc.enCurso += 1;
        }

        return acc;
      },
      { enCurso: 0, listas: 0 }
    );
  }, [mesasSalonActivas]);

  async function marcarTakeawayEntregado(pedidoId: number) {
    setActualizandoPedidoId(pedidoId);
    setMensaje(null);
    setError(null);

    const { error: updateError } = await supabase
      .from('pedidos')
      .update({ estado: 'entregado' })
      .eq('id', pedidoId);

    if (updateError) {
      console.error('No se pudo marcar el pedido como entregado:', updateError);
      setError('No se pudo marcar el pedido como entregado.');
      setActualizandoPedidoId(null);
      return;
    }

    setMensaje(`Pedido #${pedidoId} marcado como entregado.`);
    setActualizandoPedidoId(null);
    await cargarDatos();
  }

  async function cerrarCuentaMesa(mesaId: number) {
    const mesa = mesasSalonActivas.find((item) => item.id === mesaId);
    if (!mesa) return;

    const mesaLabel = getMesaDisplayName(mesa);

    const confirmar = window.confirm(
      `¿Cerrar la cuenta de ${mesaLabel}? Esto va a pasar todos sus pedidos activos a "cerrado".`
    );
    if (!confirmar) return;

    setCerrandoMesaId(mesaId);
    setMensaje(null);
    setError(null);

    const ids = mesa.pedidos.map((pedido) => pedido.id);

    const { error: updateError } = await supabase
      .from('pedidos')
      .update({ estado: 'cerrado' })
      .in('id', ids);

    if (updateError) {
      console.error('No se pudo cerrar la cuenta de la mesa:', updateError);
      setError('No se pudo cerrar la cuenta de la mesa.');
      setCerrandoMesaId(null);
      return;
    }

    setMensaje(`Cuenta de ${mesaLabel} cerrada correctamente.`);
    setCerrandoMesaId(null);
    await cargarDatos();
  }

  if (checkingAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-100">
        <p>Verificando acceso a Mostrador / Caja...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                  MOSTRADOR / CAJA
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  Plan {formatPlanLabel(currentPlan)}
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  Modo {formatBusinessModeLabel(businessMode)}
                </span>

                {businessMode === 'restaurant' && canUseWaiterMode ? (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                    Pro / mozo disponible
                  </span>
                ) : null}
              </div>

              <h1 className="mt-4 text-3xl font-bold text-slate-900">
                Operación final de pedidos
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
                Esta pantalla toma el relevo después de cocina. En take away sirve
                para marcar pedidos entregados. En restaurante también te permite
                detectar mesas listas y cerrar la cuenta cuando el comensal ya se fue.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  void cargarDatos();
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Actualizar
              </button>

              <button
                onClick={() => router.push('/cocina')}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Ver cocina
              </button>

              <button
                onClick={() => router.push('/retiro')}
                className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
              >
                Ver pantalla pública
              </button>

              {businessMode === 'restaurant' && canUseWaiterMode ? (
                <button
                  onClick={() => router.push('/mozo/mesas')}
                  className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
                >
                  Ver mozo
                </button>
              ) : null}

              <button
                onClick={() => router.push('/inicio')}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Volver a inicio
              </button>
            </div>
          </div>
        </header>

        {mensaje ? (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {mensaje}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {cargando ? (
          <div className="rounded-3xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-600 shadow-sm">
            Cargando mostrador...
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-2">
          <article className="rounded-3xl border border-amber-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Take away
                </p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">
                  Pedidos para mostrador
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Cuando un pedido está <strong>listo</strong>, se entrega desde acá y
                  se marca como <strong>entregado</strong>.
                </p>
              </div>

              <div className="grid gap-2 text-right">
                <div className="rounded-2xl bg-slate-50 px-4 py-2">
                  <p className="text-xs text-slate-500">En curso</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {takeawayResumen.enCurso}
                  </p>
                </div>
                <div className="rounded-2xl bg-emerald-50 px-4 py-2">
                  <p className="text-xs text-emerald-700">Listos</p>
                  <p className="text-2xl font-bold text-emerald-900">
                    {takeawayResumen.listos}
                  </p>
                </div>
              </div>
            </div>

            {takeawayPedidos.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-amber-300 px-4 py-8 text-center text-sm text-slate-600">
                No hay pedidos take away activos.
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {takeawayPedidos.map((pedido) => {
                  const paymentBadge = getPaymentBadge(pedido);
                  const estadoLabel = formatEstadoLabel(pedido.estado);
                  const ready = normalizeText(pedido.estado) === 'listo';

                  return (
                    <article
                      key={pedido.id}
                      className={`rounded-2xl border px-4 py-4 ${
                        ready
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                              TAKE AWAY
                            </span>

                            <span
                              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getEstadoBadgeClass(
                                pedido.estado
                              )}`}
                            >
                              {estadoLabel}
                            </span>

                            <span
                              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${paymentBadge.className}`}
                            >
                              {paymentBadge.label}
                            </span>
                          </div>

                          <h3 className="mt-3 text-xl font-bold text-slate-900">
                            {getTakeawayLabel(pedido)}
                          </h3>

                          <p className="mt-1 text-sm text-slate-600">
                            {pedido.codigo_publico || `Pedido #${pedido.id}`}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            Creado: {formatDateTime(pedido.creado_en)}
                          </p>

                          {pedido.estado_pago ? (
                            <p className="mt-1 text-xs text-slate-500">
                              Estado de pago: {pedido.estado_pago}
                            </p>
                          ) : null}
                        </div>

                        <div className="text-right">
                          <p className="text-xs text-slate-500">Total</p>
                          <p className="text-xl font-bold text-slate-900">
                            {formatMoney(pedido.total)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {ready ? (
                          <button
                            type="button"
                            onClick={() => {
                              void marcarTakeawayEntregado(pedido.id);
                            }}
                            disabled={actualizandoPedidoId === pedido.id}
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {actualizandoPedidoId === pedido.id
                              ? 'Marcando...'
                              : 'Marcar entregado'}
                          </button>
                        ) : (
                          <span className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
                            Esperando que cocina lo marque como listo
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Salón
                </p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">
                  Mesas activas
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  En Esencial, esta pantalla reemplaza el paso operativo final del
                  salón: detectar mesas listas y cerrar la cuenta cuando corresponde.
                </p>
              </div>

              <div className="grid gap-2 text-right">
                <div className="rounded-2xl bg-amber-50 px-4 py-2">
                  <p className="text-xs text-amber-700">En curso</p>
                  <p className="text-2xl font-bold text-amber-900">
                    {salonResumen.enCurso}
                  </p>
                </div>
                <div className="rounded-2xl bg-emerald-50 px-4 py-2">
                  <p className="text-xs text-emerald-700">Listas</p>
                  <p className="text-2xl font-bold text-emerald-900">
                    {salonResumen.listas}
                  </p>
                </div>
              </div>
            </div>

            {mesasSalonActivas.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-600">
                No hay mesas con pedidos activos.
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {mesasSalonActivas.map((mesa) => {
                  const estadoMesa = calcularEstadoMesa(mesa);

                  return (
                    <article
                      key={mesa.id}
                      className={`rounded-2xl border px-4 py-4 ${
                        estadoMesa === 'lista'
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            {getMesaEstadoBadge(estadoMesa)}
                          </div>

                          <h3 className="mt-3 text-xl font-bold text-slate-900">
                            {getMesaDisplayName(mesa)}
                          </h3>

                          <p className="mt-1 text-sm text-slate-600">
                            {mesa.pedidos.length} pedido
                            {mesa.pedidos.length !== 1 ? 's' : ''} activo
                            {mesa.pedidos.length !== 1 ? 's' : ''}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-xs text-slate-500">Total mesa</p>
                          <p className="text-xl font-bold text-slate-900">
                            {formatMoney(mesa.totalMesa)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 space-y-2">
                        {mesa.pedidos.map((pedido) => {
                          const paymentBadge = getPaymentBadge(pedido);

                          return (
                            <div
                              key={pedido.id}
                              className="rounded-xl border border-slate-200 bg-white/80 px-3 py-3"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold text-slate-900">
                                      {pedido.codigo_publico || `Pedido #${pedido.id}`}
                                    </span>

                                    <span
                                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getEstadoBadgeClass(
                                        pedido.estado
                                      )}`}
                                    >
                                      {formatEstadoLabel(pedido.estado)}
                                    </span>

                                    <span
                                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${paymentBadge.className}`}
                                    >
                                      {paymentBadge.label}
                                    </span>
                                  </div>

                                  <p className="mt-1 text-xs text-slate-500">
                                    {formatTime(pedido.creado_en)}
                                    {pedido.estado_pago
                                      ? ` · Pago: ${pedido.estado_pago}`
                                      : ''}
                                  </p>
                                </div>

                                <div className="text-right text-sm font-semibold text-slate-900">
                                  {formatMoney(pedido.total)}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void cerrarCuentaMesa(mesa.id);
                          }}
                          disabled={cerrandoMesaId === mesa.id}
                          className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                        >
                          {cerrandoMesaId === mesa.id
                            ? 'Cerrando...'
                            : 'Cerrar cuenta / liberar mesa'}
                        </button>

                        {estadoMesa === 'lista' ? (
                          <span className="rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-2 text-sm text-emerald-800">
                            La cocina ya la marcó como lista
                          </span>
                        ) : (
                          <span className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
                            Todavía hay pedidos en curso para esta mesa
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {businessMode === 'takeaway' ? (
              <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                El local está configurado en modo <strong>take away</strong>. Esta
                sección de salón puede quedar vacía y eso es normal.
              </div>
            ) : null}
          </article>
        </section>
      </div>
    </main>
  );
}