'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  formatBusinessModeLabel,
  formatPlanLabel,
  normalizeBusinessMode,
  type BusinessMode,
  type PlanCode,
} from '@/lib/plans';

type OperacionCanal = 'restaurant' | 'takeaway' | 'delivery';

type OperacionPedido = {
  id: number;
  mesa_id: number | null;
  mesa_nombre?: string;
  creado_en: string;
  estado: string;
  total: number | string | null;
  origen?: string | null;
  tipo_servicio?: string | null;
  cliente_nombre?: string | null;
  cliente_telefono?: string | null;
  direccion_entrega?: string | null;
  medio_pago?: string | null;
  estado_pago?: string | null;
  efectivo_aprobado?: boolean | null;
  codigo_publico?: string | null;
  operacion_canal?: OperacionCanal;
};

type WhatsappAlert = {
  id: number;
  telefono: string | null;
  pedido_id: number | null;
  motivo: string;
  mensaje: string;
  prioridad: string;
  requiere_atencion_humana: boolean;
  resuelta: boolean;
  created_at: string;
};

type OperativeReport = {
  pedidosActivosLocal: number;
  pedidosFinalizadosRecientes: number;
  pedidosCanceladosRecientes: number;
  ticketPromedioFinalizadosRecientes: number;
  mesasActivasSalon: number;
  mesasListasParaCaja: number;
  takeawaysListos: number;
  entregasDeliveryActivas: number;
};

type OperacionesResponse = {
  resumen: {
    salonSolicitados: number;
    salonEnCurso: number;
    salonListos: number;
    deliveryPendientesAprobacion: number;
    deliveryActivos: number;
    alertasWhatsAppAbiertas: number;
    localRestaurantActivos: number;
    localTakeawayActivos: number;
    localRestaurantSolicitados: number;
    localRestaurantEnCurso: number;
    localRestaurantListos: number;
    localTakeawaySolicitados: number;
    localTakeawayEnCurso: number;
    localTakeawayListos: number;
    localSolicitados?: number;
    localEnCurso?: number;
    localListos?: number;
    salonMesasActivas?: number;
    salonMesasEnCurso?: number;
    salonMesasListasParaCaja?: number;
  };
  salonPedidos: OperacionPedido[];
  takeawayPedidos?: OperacionPedido[];
  localPedidos?: OperacionPedido[];
  historialPedidos?: OperacionPedido[];
  reporteOperativo?: OperativeReport;
  deliveryPedidos: OperacionPedido[];
  whatsappAlertas: WhatsappAlert[];
  meta?: {
    alertasDisponibles?: boolean;
    operation_identity?: 'mesa' | 'persona';
    restaurant?: {
      id: string | number;
      slug: string;
      plan?: string | null;
    } | null;
  };
};

type AdminSessionPayload = {
  adminId: string;
  email: string;
  iat: number;
  exp: number;
  tenantId?: string;
  plan?: PlanCode;
  business_mode?: BusinessMode;
  addons?: {
    whatsapp_delivery?: boolean;
  };
  capabilities?: {
    analytics?: boolean;
    delivery?: boolean;
    waiter_mode?: boolean;
  };
  restaurant?: {
    id: string;
    slug: string;
    plan: PlanCode;
    business_mode?: BusinessMode;
  } | null;
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

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function prioridadClasses(prioridad: string) {
  if (prioridad === 'alta') {
    return 'bg-red-100 text-red-800 border-red-200';
  }
  if (prioridad === 'media') {
    return 'bg-amber-100 text-amber-800 border-amber-200';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function normalizeTipoServicio(value: unknown) {
  const raw = String(value ?? '').trim().toLowerCase();

  if (raw === 'delivery' || raw === 'envio') return 'delivery';

  if (
    raw === 'takeaway' ||
    raw === 'take_away' ||
    raw === 'pickup' ||
    raw === 'pick_up' ||
    raw === 'retiro'
  ) {
    return 'takeaway';
  }

  return 'mesa';
}

function resolveOperacionCanal(pedido: OperacionPedido): OperacionCanal {
  if (
    pedido.operacion_canal === 'restaurant' ||
    pedido.operacion_canal === 'takeaway' ||
    pedido.operacion_canal === 'delivery'
  ) {
    return pedido.operacion_canal;
  }

  const tipoServicio = normalizeTipoServicio(pedido.tipo_servicio);
  const origen = String(pedido.origen ?? '').trim().toLowerCase();

  if (
    tipoServicio === 'delivery' ||
    origen === 'delivery' ||
    origen === 'delivery_whatsapp' ||
    origen === 'delivery_manual'
  ) {
    return 'delivery';
  }

  if (
    tipoServicio === 'takeaway' ||
    origen === 'takeaway' ||
    origen === 'pickup' ||
    origen === 'retiro' ||
    origen === 'takeaway_web' ||
    origen === 'takeaway_manual' ||
    origen === 'takeaway_manual_mostrador'
  ) {
    return 'takeaway';
  }

  return 'restaurant';
}

function formatEstadoLabel(value: string) {
  const estado = String(value ?? '').trim().toLowerCase();

  if (estado === 'solicitado') return 'Solicitado';
  if (estado === 'pendiente') return 'Pendiente';
  if (estado === 'en_preparacion') return 'En preparación';
  if (estado === 'listo') return 'Listo';
  if (estado === 'cancelado') return 'Cancelado';
  if (estado === 'cerrado') return 'Cerrado';
  if (estado === 'entregado') return 'Entregado';

  return value || 'Sin estado';
}

function getCanalBadge(canal: OperacionCanal) {
  if (canal === 'takeaway') {
    return {
      label: 'TAKE AWAY',
      className:
        'rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800',
    };
  }

  if (canal === 'delivery') {
    return {
      label: 'DELIVERY',
      className:
        'rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-800',
    };
  }

  return {
    label: 'SALÓN',
    className:
      'rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700',
  };
}

function getLocalLocationLabel(pedido: OperacionPedido, canal: OperacionCanal) {
  if (canal === 'takeaway') {
    return 'Retiro / mostrador';
  }

  if (canal === 'delivery') {
    return 'Delivery';
  }

  if (pedido.mesa_nombre?.trim()) {
    return pedido.mesa_nombre.trim();
  }

  if (pedido.mesa_id != null) {
    return `Mesa ID ${pedido.mesa_id}`;
  }

  return 'Mesa';
}

function getLocalSecondaryLabel(
  pedido: OperacionPedido,
  canal: OperacionCanal
) {
  if (canal === 'takeaway') {
    return pedido.cliente_nombre?.trim() || 'Cliente sin nombre';
  }

  if (canal === 'delivery') {
    return pedido.cliente_nombre?.trim() || 'Cliente sin nombre';
  }

  return formatDate(pedido.creado_en);
}

function getHistoryDetailLabel(
  pedido: OperacionPedido,
  canal: OperacionCanal
) {
  if (canal === 'delivery') {
    return pedido.direccion_entrega?.trim() || 'Sin dirección';
  }

  if (canal === 'takeaway') {
    return pedido.cliente_nombre?.trim() || 'Cliente sin nombre';
  }

  return getLocalLocationLabel(pedido, canal);
}

export default function AdminOperacionesPage() {
  const [data, setData] = useState<OperacionesResponse | null>(null);
  const [sessionData, setSessionData] = useState<AdminSessionPayload | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const plan = sessionData?.plan ?? 'esencial';
  const planLabel = formatPlanLabel(plan);

  const businessMode = normalizeBusinessMode(
    sessionData?.business_mode ?? sessionData?.restaurant?.business_mode
  );
  const businessModeLabel = formatBusinessModeLabel(businessMode);
  const deliveryAddonEnabled = !!sessionData?.addons?.whatsapp_delivery;
  const waiterModeEnabled = !!sessionData?.capabilities?.waiter_mode;
  const hasAdvancedOperations =
    plan === 'pro' || plan === 'intelligence';

  async function cargar() {
    try {
      setError('');

      const [sessionRes, operacionesRes] = await Promise.all([
        fetch('/api/admin/session', {
          method: 'GET',
          cache: 'no-store',
        }),
        fetch('/api/admin/operaciones-resumen', {
          method: 'GET',
          cache: 'no-store',
        }),
      ]);

      const sessionBody = await sessionRes.json().catch(() => null);
      const operacionesBody = await operacionesRes.json().catch(() => null);

      if (!sessionRes.ok) {
        throw new Error(
          sessionBody?.error || 'No se pudo cargar la sesión administrativa.'
        );
      }

      if (!operacionesRes.ok) {
        throw new Error(
          operacionesBody?.error || 'No se pudo cargar el panel de operaciones.'
        );
      }

      setSessionData(
        (sessionBody?.session as AdminSessionPayload | null) ?? null
      );
      setData((operacionesBody as OperacionesResponse | null) ?? null);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar el panel de operaciones.'
      );
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();

    const interval = setInterval(() => {
      void cargar();
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const localPedidosConCanal = useMemo(() => {
    return (data?.localPedidos ?? data?.salonPedidos ?? []).map((pedido) => ({
      ...pedido,
      _canal: resolveOperacionCanal(pedido),
    }));
  }, [data?.localPedidos, data?.salonPedidos]);

  const localResumenCanales = useMemo(() => {
    return localPedidosConCanal.reduce(
      (acc, pedido) => {
        if (pedido._canal === 'takeaway') acc.takeaway += 1;
        if (pedido._canal === 'restaurant') acc.restaurant += 1;
        return acc;
      },
      { restaurant: 0, takeaway: 0 }
    );
  }, [localPedidosConCanal]);

  const historialPedidosConCanal = useMemo(() => {
    return (data?.historialPedidos ?? []).map((pedido) => ({
      ...pedido,
      _canal: resolveOperacionCanal(pedido),
    }));
  }, [data?.historialPedidos]);

  const copy = useMemo(() => {
    return {
      intro:
        hasAdvancedOperations
          ? 'Tablero operativo del negocio. En este plan ya contás con gestión operativa ampliada: operación activa, reporte rápido e historial operativo reciente.'
          : 'Tablero operativo del negocio. Acá monitoreás la operación activa y bajás a los módulos internos para accionar.',
      localTitle: 'Operación activa del local',
      localDescription:
        businessMode === 'takeaway'
          ? 'Pedidos abiertos del negocio para preparación, entrega y retiro en mostrador.'
          : 'Pedidos abiertos del negocio en salón y take away para preparación, cobro, entrega o cierre según el caso.',
      localEmpty: 'No hay movimientos activos del local.',
      statsRequested: 'Local · solicitados',
      statsInProgress: 'Local · en curso',
      statsReady: 'Local · listos',
    };
  }, [businessMode, hasAdvancedOperations]);

  const quickFlowText = useMemo(() => {
    if (businessMode === 'takeaway') {
      return 'En take away, el flujo práctico es: cliente pide → cocina prepara → mostrador concentra la entrega, el cobro y el retiro.';
    }

    if (waiterModeEnabled) {
      return 'En restaurante con Pro o superior, el flujo práctico es: cliente o mozo generan pedido → cocina prepara → mozo acompaña el salón → mostrador/caja cobra y cierra la cuenta.';
    }

    return 'En restaurante con Esencial, el flujo práctico es: cliente pide → cocina prepara → mostrador/caja concentra la gestión operativa final del salón.';
  }, [businessMode, waiterModeEnabled]);

  return (
    <main className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Operaciones en tiempo real</h1>
          <p className="mt-1 text-sm text-neutral-600">{copy.intro}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              Plan {planLabel}
            </span>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              Modo {businessModeLabel}
            </span>

            {hasAdvancedOperations ? (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                Gestión operativa ampliada
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/inicio"
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          >
            Volver a inicio
          </Link>

          <Link
            href="/admin"
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          >
            Ir a admin
          </Link>

          <Link
            href="/cocina"
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          >
            Ver cocina
          </Link>

          <Link
            href="/mostrador"
            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 hover:bg-amber-100"
          >
            Ir a mostrador / caja
          </Link>

          {businessMode === 'restaurant' && waiterModeEnabled ? (
            <Link
              href="/mozo/mesas"
              className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
            >
              Ver mozo
            </Link>
          ) : null}

          <button
            type="button"
            onClick={() => {
              void cargar();
            }}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          >
            Actualizar
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
        <p className="font-semibold">Cómo leer este tablero</p>
        <p className="mt-1 leading-relaxed">{quickFlowText}</p>
      </div>

      {cargando && !data ? <p>Cargando panel...</p> : null}

      {data ? (
        <>
          <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Link
              href="/mostrador"
              className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
            >
              <p className="text-sm font-semibold text-amber-800">
                Acción operativa
              </p>
              <h2 className="mt-2 text-xl font-bold text-slate-900">
                Mostrador / Caja
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Pantalla central para resolver pedidos, cobrar, entregar y cerrar
                la operación del local.
              </p>
            </Link>

            <Link
              href="/cocina"
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
            >
              <p className="text-sm font-semibold text-slate-700">Producción</p>
              <h2 className="mt-2 text-xl font-bold text-slate-900">Cocina</h2>
              <p className="mt-2 text-sm text-slate-600">
                Producción del local: tomar pedidos, prepararlos y dejarlos listos
                para entregar.
              </p>
            </Link>

            {businessMode === 'restaurant' && waiterModeEnabled ? (
              <Link
                href="/mozo/mesas"
                className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
              >
                <p className="text-sm font-semibold text-emerald-800">
                  Atención de salón
                </p>
                <h2 className="mt-2 text-xl font-bold text-slate-900">Mozo</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Atención del salón, seguimiento por mesa y apoyo operativo
                  distribuido.
                </p>
              </Link>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-700">
                  Atención de salón
                </p>
                <h2 className="mt-2 text-xl font-bold text-slate-900">
                  Sin modo mozo activo
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  En este contexto, la operación se concentra entre mostrador/caja
                  y cocina.
                </p>
              </div>
            )}

            <Link
              href="/admin"
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
            >
              <p className="text-sm font-semibold text-slate-700">
                Vista comercial
              </p>
              <h2 className="mt-2 text-xl font-bold text-slate-900">
                Dashboard admin
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Resumen comercial del negocio, módulos disponibles y navegación
                general.
              </p>
            </Link>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <article className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-sm text-neutral-500">{copy.statsRequested}</p>
              <p className="mt-2 text-3xl font-semibold">
                {data.resumen.localSolicitados ?? data.resumen.salonSolicitados}
              </p>
            </article>

            <article className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-sm text-neutral-500">{copy.statsInProgress}</p>
              <p className="mt-2 text-3xl font-semibold">
                {data.resumen.localEnCurso ?? data.resumen.salonEnCurso}
              </p>
            </article>

            <article className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-sm text-neutral-500">{copy.statsReady}</p>
              <p className="mt-2 text-3xl font-semibold">
                {data.resumen.localListos ?? data.resumen.salonListos}
              </p>
            </article>

            <article className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-sm text-neutral-500">Delivery · activos</p>
              <p className="mt-2 text-3xl font-semibold">
                {data.resumen.deliveryActivos}
              </p>
            </article>

            <article className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-sm text-neutral-500">
                Delivery · efectivo pendiente
              </p>
              <p className="mt-2 text-3xl font-semibold">
                {data.resumen.deliveryPendientesAprobacion}
              </p>
            </article>

            <article className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-sm text-neutral-500">
                WhatsApp · alertas abiertas
              </p>
              <p className="mt-2 text-3xl font-semibold">
                {data.resumen.alertasWhatsAppAbiertas}
              </p>
            </article>
          </section>

          {hasAdvancedOperations ? (
            <section className="mt-8 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <article className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <h2 className="text-lg font-medium">Reporte operativo rápido</h2>
                  <p className="mt-1 text-sm text-neutral-600">
                    Esta es la capa propia de Pro: lectura operativa del turno sin
                    meterse todavía en analytics avanzados.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Pedidos activos local</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {data.reporteOperativo?.pedidosActivosLocal ?? 0}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Finalizados recientes</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {data.reporteOperativo?.pedidosFinalizadosRecientes ?? 0}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Cancelados recientes</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {data.reporteOperativo?.pedidosCanceladosRecientes ?? 0}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">
                      Ticket promedio reciente
                    </p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {formatMoney(
                        data.reporteOperativo?.ticketPromedioFinalizadosRecientes ?? 0
                      )}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Mesas listas para caja</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {data.reporteOperativo?.mesasListasParaCaja ?? 0}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Take away listos</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {data.reporteOperativo?.takeawaysListos ?? 0}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  Pro se ve acá: más control operativo, más lectura del turno y más
                  orden entre salón, cocina y caja.
                </div>
              </article>

              <article className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-medium">
                      Historial operativo reciente
                    </h2>
                    <p className="mt-1 text-sm text-neutral-600">
                      Últimos pedidos con estado final para seguir cierres,
                      entregas y cancelaciones.
                    </p>
                  </div>

                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    Pro / Intelligence
                  </span>
                </div>

                {historialPedidosConCanal.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-neutral-600">
                    Todavía no hay historial operativo reciente para mostrar.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {historialPedidosConCanal.map((pedido) => {
                      const canal = pedido._canal;
                      const canalBadge = getCanalBadge(canal);

                      return (
                        <article
                          key={pedido.id}
                          className="rounded-xl border px-4 py-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={canalBadge.className}>
                                  {canalBadge.label}
                                </span>

                                <span
                                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${(() => {
                                    const estado = String(pedido.estado ?? '')
                                      .trim()
                                      .toLowerCase();

                                    if (estado === 'cancelado') {
                                      return 'border-rose-200 bg-rose-100 text-rose-800';
                                    }

                                    return 'border-emerald-200 bg-emerald-100 text-emerald-800';
                                  })()}`}
                                >
                                  {formatEstadoLabel(pedido.estado)}
                                </span>
                              </div>

                              <h3 className="mt-2 text-base font-semibold">
                                {pedido.codigo_publico || `Pedido #${pedido.id}`}
                              </h3>

                              <p className="text-sm text-neutral-600">
                                {getHistoryDetailLabel(pedido, canal)}
                              </p>

                              <p className="mt-1 text-xs text-neutral-500">
                                {formatDate(pedido.creado_en)}
                              </p>
                            </div>

                            <div className="text-right">
                              <p className="text-sm text-neutral-500">Total</p>
                              <p className="font-semibold">
                                {formatMoney(pedido.total)}
                              </p>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </article>
            </section>
          ) : (
            <section className="mt-8 rounded-2xl border border-blue-200 bg-blue-50 p-5">
              <p className="font-medium text-blue-900">
                La operación activa ya la ves desde Esencial
              </p>
              <p className="mt-2 text-sm leading-relaxed text-blue-900">
                En <strong>Pro</strong>, este mismo tablero suma dos capas nuevas:
                <strong> reporte operativo rápido</strong> e
                <strong> historial operativo reciente</strong>. Ahí es donde
                aparece la gestión operativa ampliada.
              </p>
            </section>
          )}

          <section className="mt-8 grid gap-6 xl:grid-cols-2">
            <article className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-medium">{copy.localTitle}</h2>
                  <p className="mt-1 text-sm text-neutral-600">
                    {copy.localDescription}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      Salón: {localResumenCanales.restaurant}
                    </span>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                      Take away: {localResumenCanales.takeaway}
                    </span>
                  </div>
                </div>

                <Link
                  href="/mostrador"
                  className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
                >
                  Operar desde mostrador
                </Link>
              </div>

              {localPedidosConCanal.length === 0 ? (
                <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-neutral-600">
                  {copy.localEmpty}
                </div>
              ) : (
                <div className="grid gap-3">
                  {localPedidosConCanal.map((pedido) => {
                    const badge = getCanalBadge(pedido._canal);

                    return (
                      <article
                        key={pedido.id}
                        className="rounded-xl border px-4 py-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={badge.className}>
                                {badge.label}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                                {getLocalLocationLabel(pedido, pedido._canal)}
                              </span>
                            </div>

                            <h3 className="mt-2 text-base font-semibold">
                              {pedido.codigo_publico || `Pedido #${pedido.id}`}
                            </h3>

                            <p className="text-sm text-neutral-600">
                              {getLocalSecondaryLabel(pedido, pedido._canal)}
                            </p>

                            {pedido._canal === 'takeaway' &&
                            pedido.creado_en ? (
                              <p className="text-xs text-neutral-500">
                                {formatDate(pedido.creado_en)}
                              </p>
                            ) : null}
                          </div>

                          <div className="text-right">
                            <p className="text-sm text-neutral-500">Estado</p>
                            <p className="font-medium">
                              {formatEstadoLabel(pedido.estado)}
                            </p>
                            <p className="mt-2 text-sm text-neutral-500">Total</p>
                            <p className="font-semibold">
                              {formatMoney(pedido.total)}
                            </p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </article>

            <article className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-lg font-medium">Delivery y WhatsApp</h2>
                <p className="mt-1 text-sm text-neutral-600">
                  Pedidos activos generados por delivery o WhatsApp.
                </p>
              </div>

              {!deliveryAddonEnabled ? (
                <div className="mb-4 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  WhatsApp Delivery no está activo para este negocio. Este bloque
                  puede seguir mostrando pedidos de delivery si existen en la
                  operación, pero el add-on se administra por separado.
                </div>
              ) : null}

              {data.deliveryPedidos.length === 0 ? (
                <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-neutral-600">
                  No hay movimientos activos de delivery.
                </div>
              ) : (
                <div className="grid gap-3">
                  {data.deliveryPedidos.map((pedido) => (
                    <article
                      key={pedido.id}
                      className="rounded-xl border px-4 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-800">
                              DELIVERY
                            </span>
                            {pedido.medio_pago === 'efectivo' &&
                            !pedido.efectivo_aprobado ? (
                              <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-800">
                                EFECTIVO PENDIENTE
                              </span>
                            ) : null}
                          </div>

                          <h3 className="mt-2 text-base font-semibold">
                            {pedido.codigo_publico || `Pedido #${pedido.id}`}
                          </h3>

                          <p className="text-sm text-neutral-600">
                            {pedido.cliente_nombre || 'Cliente sin nombre'}
                          </p>

                          <p className="text-sm text-neutral-600">
                            {pedido.cliente_telefono || 'Sin teléfono'}
                          </p>

                          <p className="text-sm text-neutral-600">
                            {pedido.direccion_entrega || 'Sin dirección'}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-sm text-neutral-500">Total</p>
                          <p className="font-semibold">
                            {formatMoney(pedido.total)}
                          </p>
                          <p className="mt-1 text-xs text-neutral-500">
                            {pedido.estado_pago || 'Sin estado de pago'}
                          </p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </article>
          </section>

          <section className="mt-8 rounded-2xl border bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-medium">
                Alertas de atención humana en WhatsApp
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                Acá deberían aparecer los casos donde el chatbot no puede resolver
                algo y hace falta intervención humana.
              </p>
            </div>

            {!deliveryAddonEnabled ? (
              <div className="mb-4 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                Como WhatsApp Delivery es un add-on separado, esta sección cobra
                sentido especialmente cuando ese módulo está activo.
              </div>
            ) : null}

            {data.meta?.alertasDisponibles === false ? (
              <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                La tabla de alertas todavía no está disponible. Cuando la crees,
                acá se van a mostrar estos avisos.
              </div>
            ) : null}

            {data.whatsappAlertas.length === 0 ? (
              <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-neutral-600">
                No hay alertas abiertas de WhatsApp.
              </div>
            ) : (
              <div className="grid gap-3">
                {data.whatsappAlertas.map((alerta) => (
                  <article
                    key={alerta.id}
                    className="rounded-xl border px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${prioridadClasses(
                              alerta.prioridad
                            )}`}
                          >
                            Prioridad {alerta.prioridad}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                            {alerta.motivo}
                          </span>
                        </div>

                        <h3 className="mt-2 text-base font-semibold">
                          {alerta.telefono || 'Teléfono no informado'}
                        </h3>

                        <p className="mt-1 text-sm text-neutral-700">
                          {alerta.mensaje}
                        </p>

                        {alerta.pedido_id ? (
                          <p className="mt-1 text-xs text-neutral-500">
                            Vinculado al pedido #{alerta.pedido_id}
                          </p>
                        ) : null}
                      </div>

                      <div className="text-right text-sm text-neutral-500">
                        {formatDate(alerta.created_at)}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}