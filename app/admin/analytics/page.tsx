'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  canAccessAnalytics,
  formatPlanLabel,
  type PlanCode,
} from '@/lib/plans';

type RowPedidosHora = { hora: string; pedidos: number };

type RowTopProductos = {
  producto_id: number;
  producto_nombre: string;
  unidades: number;
  ingresos: number;
};

type RowCanal = {
  canal: 'salon' | 'takeaway' | 'delivery';
  cantidad: number;
  ingresos: number;
};

type RowTiemposPedido = {
  pedido_id: number;
  mesa_id: number;
  creado_en: string;
  estado_actual: string;
  min_mozo_confirma: number | null;
  min_espera_cocina: number | null;
  min_preparacion: number | null;
  min_total_hasta_listo: number | null;
};


function toIsoStartOfDayAR(localDate: string) {
  return new Date(`${localDate}T00:00:00-03:00`).toISOString();
}

function toIsoEndOfDayAR(localDate: string) {
  return new Date(`${localDate}T23:59:59.999-03:00`).toISOString();
}

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function formatHourBucket(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function safeRound(value: number) {
  return Math.round(value * 100) / 100;
}

function formatCanalLabel(canal: RowCanal['canal']) {
  switch (canal) {
    case 'delivery':
      return 'Delivery';
    case 'takeaway':
      return 'Take Away';
    case 'salon':
    default:
      return 'Salón';
  }
}

export default function AdminAnalyticsPage() {
  const router = useRouter();

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  const y2 = sevenDaysAgo.getFullYear();
  const m2 = String(sevenDaysAgo.getMonth() + 1).padStart(2, '0');
  const d2 = String(sevenDaysAgo.getDate()).padStart(2, '0');
  const sevenDaysAgoStr = `${y2}-${m2}-${d2}`;

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [canViewAnalytics, setCanViewAnalytics] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<PlanCode>('esencial');

  const [desde, setDesde] = useState(sevenDaysAgoStr);
  const [hasta, setHasta] = useState(todayStr);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [pedidosHora, setPedidosHora] = useState<RowPedidosHora[]>([]);
  const [topProductos, setTopProductos] = useState<RowTopProductos[]>([]);
  const [canales, setCanales] = useState<RowCanal[]>([]);
  const [tiempos, setTiempos] = useState<RowTiemposPedido[]>([]);
  const [kpiPedidosTotal, setKpiPedidosTotal] = useState(0);
  const [kpiPedidosCerrados, setKpiPedidosCerrados] = useState(0);
  const [kpiPedidosCancelados, setKpiPedidosCancelados] = useState(0);
  const [kpiIngresos, setKpiIngresos] = useState(0);
  const [kpiTicketProm, setKpiTicketProm] = useState<number | null>(null);

  const isoDesde = useMemo(() => toIsoStartOfDayAR(desde), [desde]);
  const isoHasta = useMemo(() => toIsoEndOfDayAR(hasta), [hasta]);
  const rangoInvalido = useMemo(() => desde > hasta, [desde, hasta]);

    const cargar = async () => {
    if (rangoInvalido) {
      setErrorMsg(
        'El rango es inválido: la fecha Desde no puede ser mayor que Hasta.'
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams({
        desde,
        hasta,
      });

      const res = await fetch(`/api/admin/analytics?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.error ?? 'Error cargando analytics');
      }

      const data = payload?.data;

      setPedidosHora((data?.pedidosHora ?? []) as RowPedidosHora[]);
      setTopProductos((data?.topProductos ?? []) as RowTopProductos[]);
      setCanales((data?.canales ?? []) as RowCanal[]);
      setTiempos((data?.tiempos ?? []) as RowTiemposPedido[]);

      setKpiPedidosTotal(Number(data?.kpis?.pedidosTotal ?? 0));
      setKpiPedidosCerrados(Number(data?.kpis?.pedidosCerrados ?? 0));
      setKpiPedidosCancelados(Number(data?.kpis?.pedidosCancelados ?? 0));
      setKpiIngresos(Number(data?.kpis?.ingresos ?? 0));

      const ticket =
        data?.kpis?.ticketPromedio == null
          ? null
          : Number(data.kpis.ticketPromedio);

      setKpiTicketProm(ticket);
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String(
              (err as { message?: string }).message ?? 'Error cargando analytics'
            )
          : 'Error cargando analytics';

      console.error(err);
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    async function bootstrap() {
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
        const enabled =
          typeof session?.capabilities?.analytics === 'boolean'
            ? session.capabilities.analytics
            : canAccessAnalytics(plan);

        setCurrentPlan(plan);
        setCanViewAnalytics(enabled);

        if (enabled) {
          await cargar();
        }
      } catch (error) {
        console.error('No se pudo verificar acceso a analytics', error);
        if (!active) return;
        setCanViewAnalytics(false);
      } finally {
        if (active) {
          setCheckingAccess(false);
        }
      }
    }

    bootstrap();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const promedio = (values: (number | null)[]) => {
    const xs = values.filter(
      (value): value is number =>
        typeof value === 'number' && !Number.isNaN(value)
    );

    if (xs.length === 0) return null;

    const total = xs.reduce((acc, value) => acc + value, 0);
    return safeRound(total / xs.length);
  };

  const promMozo = useMemo(
    () => promedio(tiempos.map((t) => t.min_mozo_confirma)),
    [tiempos]
  );

  const promCola = useMemo(
    () => promedio(tiempos.map((t) => t.min_espera_cocina)),
    [tiempos]
  );

  const promPrep = useMemo(
    () => promedio(tiempos.map((t) => t.min_preparacion)),
    [tiempos]
  );

  const promTotal = useMemo(
    () => promedio(tiempos.map((t) => t.min_total_hasta_listo)),
    [tiempos]
  );

  const porcentajeCancelacion = useMemo(() => {
    if (kpiPedidosTotal === 0) return null;
    return safeRound((kpiPedidosCancelados / kpiPedidosTotal) * 100);
  }, [kpiPedidosCancelados, kpiPedidosTotal]);

  const horaPico = useMemo(() => {
    if (pedidosHora.length === 0) return null;

    return pedidosHora.reduce<RowPedidosHora | null>((max, row) => {
      if (!max) return row;
      return row.pedidos > max.pedidos ? row : max;
    }, null);
  }, [pedidosHora]);

  const productoLider = useMemo(() => {
    return topProductos.length > 0 ? topProductos[0] : null;
  }, [topProductos]);

  const outliers = useMemo(() => {
    return tiempos
      .filter((t) => (t.min_total_hasta_listo ?? 0) >= 30)
      .sort(
        (a, b) =>
          (b.min_total_hasta_listo ?? 0) - (a.min_total_hasta_listo ?? 0)
      )
      .slice(0, 10);
  }, [tiempos]);

  const estadoOperacion = useMemo(() => {
    if (kpiPedidosTotal === 0) {
      return {
        label: 'Sin datos suficientes',
        tone: 'border-slate-200 bg-slate-50 text-slate-700',
        description:
          'Todavía no hay suficientes pedidos en el rango para elaborar una lectura operativa.',
      };
    }

    const cancelacionAlta = (porcentajeCancelacion ?? 0) >= 12;
    const demoraAlta = (promTotal ?? 0) >= 25;
    const demoraMedia = (promTotal ?? 0) >= 18;

    if (cancelacionAlta || demoraAlta) {
      return {
        label: 'Atención',
        tone: 'border-rose-200 bg-rose-50 text-rose-700',
        description:
          'Hay señales de fricción operativa: revisá demoras, carga de cocina y causas de cancelación.',
      };
    }

    if (demoraMedia) {
      return {
        label: 'Estable con margen de mejora',
        tone: 'border-amber-200 bg-amber-50 text-amber-700',
        description:
          'La operación está funcionando, pero los tiempos podrían optimizarse para sostener mejor la rotación.',
      };
    }

    return {
      label: 'Saludable',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      description:
        'Los indicadores del período muestran una operación ordenada y sin alertas fuertes.',
    };
  }, [kpiPedidosTotal, porcentajeCancelacion, promTotal]);

  const insights = useMemo(() => {
    const items: string[] = [];

    if (productoLider) {
      items.push(
        `El producto más fuerte del período fue ${productoLider.producto_nombre}, con ${productoLider.unidades} unidades y ${formatCurrency(productoLider.ingresos)} de ingresos.`
      );
    }

    if (horaPico) {
      items.push(
        `La franja con mayor demanda fue ${formatHourBucket(horaPico.hora)}, con ${horaPico.pedidos} pedidos.`
      );
    }

    if (porcentajeCancelacion != null) {
      if (porcentajeCancelacion >= 12) {
        items.push(
          `La cancelación está en ${porcentajeCancelacion}%, un nivel alto para seguir de cerca.`
        );
      } else if (porcentajeCancelacion >= 6) {
        items.push(
          `La cancelación está en ${porcentajeCancelacion}%, en una zona intermedia que conviene monitorear.`
        );
      } else {
        items.push(
          `La cancelación está en ${porcentajeCancelacion}%, un valor sano para la operación.`
        );
      }
    }

    if (promTotal != null) {
      if (promTotal >= 25) {
        items.push(
          `El tiempo promedio total hasta listo es ${promTotal} min, con una demora alta para este rango.`
        );
      } else if (promTotal >= 18) {
        items.push(
          `El tiempo promedio total hasta listo es ${promTotal} min, aceptable pero con margen de mejora.`
        );
      } else {
        items.push(
          `El tiempo promedio total hasta listo es ${promTotal} min, una señal positiva de fluidez operativa.`
        );
      }
    }

    if (items.length === 0) {
      items.push(
        'Todavía no hay suficiente información para generar lecturas ejecutivas del período seleccionado.'
      );
    }

    return items.slice(0, 4);
  }, [horaPico, porcentajeCancelacion, productoLider, promTotal]);

  if (checkingAccess) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-slate-600">Verificando acceso a analytics…</p>
        </div>
      </main>
    );
  }

  if (!canViewAnalytics) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-3xl border border-blue-200 bg-white p-8 shadow-sm">
            <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              Disponible en Intelligence
            </span>

            <h1 className="mt-4 text-3xl font-bold text-slate-900">
              Analytics avanzados
            </h1>

            <p className="mt-3 leading-relaxed text-slate-600">
              Tu plan actual es <strong>{formatPlanLabel(currentPlan)}</strong>.
              Los reportes avanzados, KPIs ejecutivos y análisis de rendimiento
              forman parte de <strong>Intelligence</strong>.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">
                  Incluye en Intelligence
                </p>
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  <li>• KPIs operativos y comerciales</li>
                  <li>• Ranking de productos</li>
                  <li>• Tiempos de preparación y outliers</li>
                  <li>• Lectura ejecutiva para decisiones</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">
                  Qué resuelve este módulo
                </p>
                <p className="mt-3 text-sm text-slate-700">
                  Te permite ver qué vendés más, dónde se te traba la operación,
                  cuándo se concentra la demanda y qué señales conviene atacar
                  primero.
                </p>
              </div>
            </div>

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
                Volver al dashboard
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2">
              <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                Intelligence activo
              </span>
            </div>

            <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
            <p className="text-sm text-slate-600">
              KPIs operativos y lectura ejecutiva basados en pedidos reales.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="block text-xs text-slate-500">Desde</span>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1"
              />
            </label>

            <label className="text-sm">
              <span className="block text-xs text-slate-500">Hasta</span>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1"
              />
            </label>

            <button
              onClick={cargar}
              disabled={loading || rangoInvalido}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>
        </header>

        {rangoInvalido && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Revisá el rango: la fecha Desde no puede ser mayor que Hasta.
          </p>
        )}

        {errorMsg && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorMsg}
          </p>
        )}

        {loading ? (
          <p className="text-slate-600">Cargando analytics…</p>
        ) : (
          <>
            <section className="grid gap-3 lg:grid-cols-3">
              <div className={`rounded-2xl border p-4 ${estadoOperacion.tone}`}>
                <div className="text-xs font-semibold uppercase tracking-wide">
                  Salud operativa
                </div>
                <div className="mt-2 text-xl font-bold">
                  {estadoOperacion.label}
                </div>
                <p className="mt-2 text-sm leading-relaxed">
                  {estadoOperacion.description}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Producto líder
                </div>
                <div className="mt-2 text-lg font-bold text-slate-900">
                  {productoLider?.producto_nombre ?? 'Sin datos'}
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {productoLider
                    ? `${productoLider.unidades} unidades · ${formatCurrency(productoLider.ingresos)}`
                    : 'Todavía no hay ventas suficientes en el rango.'}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Hora pico
                </div>
                <div className="mt-2 text-lg font-bold text-slate-900">
                  {horaPico ? formatHourBucket(horaPico.hora) : 'Sin datos'}
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {horaPico
                    ? `${horaPico.pedidos} pedidos en la franja más cargada`
                    : 'No hay suficiente actividad para detectar una franja pico.'}
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    Lectura ejecutiva del período
                  </h2>
                  <p className="text-sm text-slate-500">
                    Resumen rápido para decidir qué mirar primero.
                  </p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  {desde} → {hasta}
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {insights.map((insight) => (
                  <div
                    key={insight}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700"
                  >
                    {insight}
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-500">Pedidos totales</div>
                <div className="text-xl font-bold">{kpiPedidosTotal}</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-500">Pedidos cerrados</div>
                <div className="text-xl font-bold">{kpiPedidosCerrados}</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-500">Pedidos cancelados</div>
                <div className="text-xl font-bold">{kpiPedidosCancelados}</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-500">Ingresos (cerrados)</div>
                <div className="text-xl font-bold">
                  {formatCurrency(kpiIngresos)}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3 md:col-span-2">
                <div className="text-xs text-slate-500">
                  Ticket promedio (cerrados)
                </div>
                <div className="text-xl font-bold">
                  {kpiTicketProm == null ? '—' : formatCurrency(kpiTicketProm)}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  Calculado como ingresos / cantidad de pedidos cerrados
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3 md:col-span-2">
                <div className="text-xs text-slate-500">% cancelación</div>
                <div className="text-xl font-bold">
                  {porcentajeCancelacion == null
                    ? '—'
                    : `${porcentajeCancelacion}%`}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-500">
                  Prom. mozo confirma (min)
                </div>
                <div className="text-xl font-bold">{promMozo ?? '—'}</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-500">
                  Prom. espera cocina (min)
                </div>
                <div className="text-xl font-bold">{promCola ?? '—'}</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-500">
                  Prom. preparación (min)
                </div>
                <div className="text-xl font-bold">{promPrep ?? '—'}</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-500">
                  Prom. total hasta listo (min)
                </div>
                <div className="text-xl font-bold">{promTotal ?? '—'}</div>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3">
                <h2 className="font-semibold text-slate-900">Ventas por canal</h2>
                <p className="text-sm text-slate-500">
                  Cantidad de pedidos e ingresos por salón, take away y delivery.
                </p>
              </div>

              {canales.length === 0 ? (
                <p className="text-sm text-slate-600">Sin datos.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-3">
                  {canales.map((canal) => (
                    <div
                      key={canal.canal}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {formatCanalLabel(canal.canal)}
                      </div>

                      <div className="mt-3 text-2xl font-bold text-slate-900">
                        {canal.cantidad}
                      </div>

                      <div className="mt-1 text-sm text-slate-600">pedidos</div>

                      <div className="mt-4 text-lg font-semibold text-slate-900">
                        {formatCurrency(canal.ingresos)}
                      </div>

                      <div className="text-sm text-slate-500">ingresos cerrados</div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-2 font-semibold text-slate-900">
                Pedidos por hora
              </h2>

              {pedidosHora.length === 0 ? (
                <p className="text-sm text-slate-600">Sin datos en el rango.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-2 pr-4">Hora</th>
                        <th className="py-2">Pedidos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedidosHora.map((row) => (
                        <tr key={row.hora} className="border-t">
                          <td className="py-2 pr-4">
                            {formatDateTime(row.hora)}
                          </td>
                          <td className="py-2 font-semibold">{row.pedidos}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-2 font-semibold text-slate-900">
                Ranking de productos más vendidos en el período seleccionado
              </h2>

              {topProductos.length === 0 ? (
                <p className="text-sm text-slate-600">Sin datos.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-2 pr-4">Producto</th>
                        <th className="py-2 pr-4">Unidades</th>
                        <th className="py-2">Ingresos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProductos.map((row) => (
                        <tr key={row.producto_id} className="border-t">
                          <td className="py-2 pr-4 font-medium">
                            {row.producto_nombre}
                          </td>
                          <td className="py-2 pr-4 font-semibold">
                            {row.unidades}
                          </td>
                          <td className="py-2 font-semibold">
                            {formatCurrency(row.ingresos)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    Pedidos lentos (outliers ≥ 30 min)
                  </h2>
                  <p className="text-sm text-slate-500">
                    Casos a revisar para detectar cuellos de botella.
                  </p>
                </div>

                <div className="text-sm text-slate-500">
                  {outliers.length} caso{outliers.length === 1 ? '' : 's'} detectado
                  {outliers.length === 1 ? '' : 's'}
                </div>
              </div>

              {outliers.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">
                  No hay outliers en el rango.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-2 pr-4">Pedido</th>
                        <th className="py-2 pr-4">Mesa</th>
                        <th className="py-2 pr-4">Creado</th>
                        <th className="py-2 pr-4">Total (min)</th>
                        <th className="py-2">Etapas (mozo / cola / prep)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outliers.map((row) => (
                        <tr key={row.pedido_id} className="border-t">
                          <td className="py-2 pr-4 font-semibold">
                            #{row.pedido_id}
                          </td>
                          <td className="py-2 pr-4">{row.mesa_id}</td>
                          <td className="py-2 pr-4">
                            {formatDateTime(row.creado_en)}
                          </td>
                          <td className="py-2 pr-4 font-bold">
                            {row.min_total_hasta_listo}
                          </td>
                          <td className="py-2">
                            {(row.min_mozo_confirma ?? '—') +
                              ' / ' +
                              (row.min_espera_cocina ?? '—') +
                              ' / ' +
                              (row.min_preparacion ?? '—')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}