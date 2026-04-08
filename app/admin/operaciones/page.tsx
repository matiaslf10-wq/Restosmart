'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  formatBusinessModeLabel,
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

type OperacionesResponse = {
  resumen: {
    salonSolicitados: number;
    salonEnCurso: number;
    salonListos: number;
    deliveryPendientesAprobacion: number;
    deliveryActivos: number;
    alertasWhatsAppAbiertas: number;
  };
  salonPedidos: OperacionPedido[];
  deliveryPedidos: OperacionPedido[];
  whatsappAlertas: WhatsappAlert[];
  meta?: {
    alertasDisponibles?: boolean;
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
    origen === 'takeaway_manual'
  ) {
    return 'takeaway';
  }

  return 'restaurant';
}

function getLocalBadge(canal: OperacionCanal) {
  if (canal === 'takeaway') {
    return {
      label: 'TAKE AWAY',
      className:
        'rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800',
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
    return pedido.mesa_nombre || 'Retiro / mostrador';
  }

  return pedido.mesa_nombre || 'Mesa';
}

export default function AdminOperacionesPage() {
  const [data, setData] = useState<OperacionesResponse | null>(null);
  const [sessionData, setSessionData] = useState<AdminSessionPayload | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const businessMode = normalizeBusinessMode(
    sessionData?.business_mode ?? sessionData?.restaurant?.business_mode
  );
  const businessModeLabel = formatBusinessModeLabel(businessMode);
  const deliveryAddonEnabled = !!sessionData?.addons?.whatsapp_delivery;

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
    cargar();

    const interval = setInterval(() => {
      cargar();
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const localPedidosConCanal = useMemo(() => {
    return (data?.salonPedidos ?? []).map((pedido) => ({
      ...pedido,
      _canal: resolveOperacionCanal(pedido),
    }));
  }, [data?.salonPedidos]);

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

  const copy = useMemo(() => {
    return {
      intro:
        'Vista operativa del local, take away, delivery y alertas de WhatsApp.',
      localTitle: 'Movimientos del local',
      localDescription:
        'Pedidos abiertos del negocio en estado solicitado, pendiente, en preparación o listo.',
      localEmpty: 'No hay movimientos activos del local.',
      statsRequested: 'Local · solicitados',
      statsInProgress: 'Local · en curso',
      statsReady: 'Local · listos',
    };
  }, []);

  return (
    <main className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Operaciones en tiempo real</h1>
          <p className="mt-1 text-sm text-neutral-600">{copy.intro}</p>
          <p className="mt-1 text-xs text-neutral-500">
            Modo actual del negocio: {businessModeLabel}
          </p>
        </div>

        <button
          type="button"
          onClick={cargar}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
        >
          Actualizar
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {cargando && !data ? <p>Cargando panel...</p> : null}

      {data ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <article className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-sm text-neutral-500">{copy.statsRequested}</p>
              <p className="mt-2 text-3xl font-semibold">
                {data.resumen.salonSolicitados}
              </p>
            </article>

            <article className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-sm text-neutral-500">{copy.statsInProgress}</p>
              <p className="mt-2 text-3xl font-semibold">
                {data.resumen.salonEnCurso}
              </p>
            </article>

            <article className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-sm text-neutral-500">{copy.statsReady}</p>
              <p className="mt-2 text-3xl font-semibold">
                {data.resumen.salonListos}
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

          <section className="mt-8 grid gap-6 xl:grid-cols-2">
            <article className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="mb-4">
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

              {localPedidosConCanal.length === 0 ? (
                <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-neutral-600">
                  {copy.localEmpty}
                </div>
              ) : (
                <div className="grid gap-3">
                  {localPedidosConCanal.map((pedido) => {
                    const badge = getLocalBadge(pedido._canal);

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
                              {formatDate(pedido.creado_en)}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-sm text-neutral-500">Estado</p>
                            <p className="font-medium">{pedido.estado}</p>
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
                  puede seguir mostrando pedidos de delivery si existen en la operación,
                  pero el add-on se administra por separado.
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