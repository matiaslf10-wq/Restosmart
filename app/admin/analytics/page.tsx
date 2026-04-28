'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { utils, writeFileXLSX } from 'xlsx';
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

type RowMarca = {
  marca_id: string | null;
  marca_nombre: string;
  marca_logo_url: string | null;
  marca_color_hex: string | null;
  unidades: number;
  ingresos: number;
  pedidos: number;
};

type RowSerieDiaria = {
  fecha: string;
  pedidos: number;
  cerrados: number;
  cancelados: number;
  ingresos: number;
};

type RangeKpis = {
  pedidosTotal: number;
  pedidosCerrados: number;
  pedidosCancelados: number;
  ingresos: number;
  ticketPromedio: number | null;
};

type ComparativaState = {
  desde: string;
  hasta: string;
  kpis: RangeKpis;
  canales: RowCanal[];
  marcas: RowMarca[];
} | null;

type ExecutiveSignalRow = {
  id: string;
  indicador: string;
  valorActual: string;
  variacion: string;
  estado: 'positivo' | 'alerta' | 'estable' | 'neutral';
  lectura: string;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(
  record: Record<string, unknown>,
  keys: string[],
  fallback = ''
) {
  for (const key of keys) {
    const value = record[key];

    if (value !== null && value !== undefined) {
      const text = String(value).trim();
      if (text.length > 0) return text;
    }
  }

  return fallback;
}

function readNullableString(record: Record<string, unknown>, keys: string[]) {
  const text = readString(record, keys, '');
  return text.length > 0 ? text : null;
}

function readNumber(record: Record<string, unknown>, keys: string[], fallback = 0) {
  for (const key of keys) {
    const num = Number(record[key]);
    if (Number.isFinite(num)) return num;
  }

  return fallback;
}

function normalizeMarcaRows(value: unknown): RowMarca[] {
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    const record = asRecord(item);

    if (!record) {
      return {
        marca_id: null,
        marca_nombre: 'Sin marca',
        marca_logo_url: null,
        marca_color_hex: null,
        unidades: 0,
        ingresos: 0,
        pedidos: 0,
      };
    }

    return {
      marca_id: readNullableString(record, ['marca_id', 'id']),
      marca_nombre: readString(
        record,
        ['marca_nombre', 'nombre', 'label'],
        'Sin marca'
      ),
      marca_logo_url: readNullableString(record, [
        'marca_logo_url',
        'logo_url',
        'logo',
      ]),
      marca_color_hex: readNullableString(record, [
        'marca_color_hex',
        'color_hex',
        'color',
      ]),
      unidades: readNumber(record, ['unidades', 'cantidad', 'items'], 0),
      ingresos: readNumber(record, ['ingresos', 'total'], 0),
      pedidos: readNumber(record, ['pedidos', 'cantidad_pedidos'], 0),
    };
  });
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

function escapeCsvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvLine(values: unknown[]) {
  return values.map(escapeCsvCell).join(';');
}

function getTrendBarWidth(value: number, max: number) {
  if (max <= 0) return '0%';
  return `${Math.max((value / max) * 100, 6)}%`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function formatInputDateAR(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';

  return `${year}-${month}-${day}`;
}

function getPreviousComparableRange(desde: string, hasta: string) {
  const start = new Date(`${desde}T00:00:00-03:00`);
  const end = new Date(`${hasta}T00:00:00-03:00`);

  const days = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;

  const prevEnd = new Date(start.getTime() - DAY_MS);
  const prevStart = new Date(start.getTime() - days * DAY_MS);

  return {
    desde: formatInputDateAR(prevStart),
    hasta: formatInputDateAR(prevEnd),
  };
}

function getDeltaPct(
  current: number | null | undefined,
  previous: number | null | undefined
) {
  const currentValue = Number(current ?? 0);

  if (previous == null) return null;

  const previousValue = Number(previous);

  if (previousValue === 0) {
    return currentValue === 0 ? 0 : null;
  }

  return safeRound(((currentValue - previousValue) / previousValue) * 100);
}

function formatDelta(delta: number | null) {
  if (delta == null) return 'Sin base comparable';

  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta}% vs período anterior`;
}

function getDeltaTone(delta: number | null, invert = false) {
  if (delta == null || delta === 0) return 'text-slate-500';

  const favorable = invert ? delta < 0 : delta > 0;

  return favorable ? 'text-emerald-600' : 'text-rose-600';
}

function getDeltaMeta(delta: number | null, invert = false) {
  if (delta == null) {
    return {
      icon: '•',
      label: 'Sin base comparable',
      className: 'bg-slate-100 text-slate-500',
    };
  }

  if (delta === 0) {
    return {
      icon: '→',
      label: '0% vs período anterior',
      className: 'bg-slate-100 text-slate-600',
    };
  }

  const favorable = invert ? delta < 0 : delta > 0;
  const icon = delta > 0 ? '↑' : '↓';
  const sign = delta > 0 ? '+' : '';

  return {
    icon,
    label: `${sign}${delta}% vs período anterior`,
    className: favorable
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      : 'bg-rose-50 text-rose-700 border border-rose-200',
  };
}

function formatShortDeltaLabel(prefix: string, delta: number | null) {
  if (delta == null) return `${prefix}: sin base`;
  if (delta === 0) return `${prefix}: 0%`;

  const sign = delta > 0 ? '+' : '';
  return `${prefix}: ${sign}${delta}%`;
}

function getExecutiveSignalClasses(estado: ExecutiveSignalRow['estado']) {
  switch (estado) {
    case 'positivo':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'alerta':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'estable':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'neutral':
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}

function isValidHexColor(value: string | null | undefined) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value ?? '').trim());
}

function getMarcaColor(marca: RowMarca, fallback = '#64748b') {
  return isValidHexColor(marca.marca_color_hex)
    ? String(marca.marca_color_hex)
    : fallback;
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');

  if (normalized.length !== 6) {
    return `rgba(100, 116, 139, ${alpha})`;
  }

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getMarcaKey(marca: RowMarca) {
  return marca.marca_id ?? `nombre:${marca.marca_nombre.toLowerCase()}`;
}

function getMarcaLabel(marca: RowMarca) {
  return marca.marca_nombre || 'Sin marca';
}

export default function AdminAnalyticsPage() {
  const router = useRouter();

  const today = new Date();
  const todayStr = formatInputDateAR(today);

  const sevenDaysAgo = new Date(Date.now() - 6 * DAY_MS);
  const sevenDaysAgoStr = formatInputDateAR(sevenDaysAgo);

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
  const [ventasPorMarca, setVentasPorMarca] = useState<RowMarca[]>([]);
  const [serieDiaria, setSerieDiaria] = useState<RowSerieDiaria[]>([]);
  const [tiempos, setTiempos] = useState<RowTiemposPedido[]>([]);
  const [kpiPedidosTotal, setKpiPedidosTotal] = useState(0);
  const [kpiPedidosCerrados, setKpiPedidosCerrados] = useState(0);
  const [kpiPedidosCancelados, setKpiPedidosCancelados] = useState(0);
  const [kpiIngresos, setKpiIngresos] = useState(0);
  const [kpiTicketProm, setKpiTicketProm] = useState<number | null>(null);
  const [comparativa, setComparativa] = useState<ComparativaState>(null);

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
        credentials: 'include',
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.error ?? 'Error cargando analytics');
      }

      const data = payload?.data;

      const currentKpis: RangeKpis = {
        pedidosTotal: Number(data?.kpis?.pedidosTotal ?? 0),
        pedidosCerrados: Number(data?.kpis?.pedidosCerrados ?? 0),
        pedidosCancelados: Number(data?.kpis?.pedidosCancelados ?? 0),
        ingresos: Number(data?.kpis?.ingresos ?? 0),
        ticketPromedio:
          data?.kpis?.ticketPromedio == null
            ? null
            : Number(data.kpis.ticketPromedio),
      };

      setPedidosHora((data?.pedidosHora ?? []) as RowPedidosHora[]);
      setTopProductos((data?.topProductos ?? []) as RowTopProductos[]);
      setCanales((data?.canales ?? []) as RowCanal[]);
      setVentasPorMarca(normalizeMarcaRows(data?.ventasPorMarca));
      setSerieDiaria((data?.serieDiaria ?? []) as RowSerieDiaria[]);
      setTiempos((data?.tiempos ?? []) as RowTiemposPedido[]);

      setKpiPedidosTotal(currentKpis.pedidosTotal);
      setKpiPedidosCerrados(currentKpis.pedidosCerrados);
      setKpiPedidosCancelados(currentKpis.pedidosCancelados);
      setKpiIngresos(currentKpis.ingresos);
      setKpiTicketProm(currentKpis.ticketPromedio);

      const previousRange = getPreviousComparableRange(desde, hasta);

      const previousParams = new URLSearchParams({
        desde: previousRange.desde,
        hasta: previousRange.hasta,
      });

      const previousRes = await fetch(
        `/api/admin/analytics?${previousParams.toString()}`,
        {
          method: 'GET',
          cache: 'no-store',
          credentials: 'include',
        }
      );

      const previousPayload = await previousRes.json().catch(() => null);

      if (previousRes.ok) {
        const previousData = previousPayload?.data;

        const previousKpis: RangeKpis = {
          pedidosTotal: Number(previousData?.kpis?.pedidosTotal ?? 0),
          pedidosCerrados: Number(previousData?.kpis?.pedidosCerrados ?? 0),
          pedidosCancelados: Number(previousData?.kpis?.pedidosCancelados ?? 0),
          ingresos: Number(previousData?.kpis?.ingresos ?? 0),
          ticketPromedio:
            previousData?.kpis?.ticketPromedio == null
              ? null
              : Number(previousData.kpis.ticketPromedio),
        };

        setComparativa({
          desde: previousRange.desde,
          hasta: previousRange.hasta,
          kpis: previousKpis,
          canales: (previousData?.canales ?? []) as RowCanal[],
          marcas: normalizeMarcaRows(previousData?.ventasPorMarca),
        });
      } else {
        setComparativa(null);
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String(
              (err as { message?: string }).message ?? 'Error cargando analytics'
            )
          : 'Error cargando analytics';

      console.error(err);
      setErrorMsg(message);
      setComparativa(null);
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
          credentials: 'include',
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

    void bootstrap();

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

  const deltaPedidosTotal = useMemo(() => {
    return getDeltaPct(kpiPedidosTotal, comparativa?.kpis.pedidosTotal);
  }, [kpiPedidosTotal, comparativa]);

  const deltaPedidosCerrados = useMemo(() => {
    return getDeltaPct(kpiPedidosCerrados, comparativa?.kpis.pedidosCerrados);
  }, [kpiPedidosCerrados, comparativa]);

  const deltaIngresos = useMemo(() => {
    return getDeltaPct(kpiIngresos, comparativa?.kpis.ingresos);
  }, [kpiIngresos, comparativa]);

  const deltaTicketProm = useMemo(() => {
    return getDeltaPct(kpiTicketProm, comparativa?.kpis.ticketPromedio);
  }, [kpiTicketProm, comparativa]);

  const comparativaCancelacion = useMemo(() => {
    if (!comparativa || comparativa.kpis.pedidosTotal === 0) return null;

    return safeRound(
      (comparativa.kpis.pedidosCancelados / comparativa.kpis.pedidosTotal) * 100
    );
  }, [comparativa]);

  const deltaCancelacion = useMemo(() => {
    return getDeltaPct(porcentajeCancelacion, comparativaCancelacion);
  }, [porcentajeCancelacion, comparativaCancelacion]);

  const deltaMetaPedidosTotal = useMemo(
    () => getDeltaMeta(deltaPedidosTotal),
    [deltaPedidosTotal]
  );

  const deltaMetaPedidosCerrados = useMemo(
    () => getDeltaMeta(deltaPedidosCerrados),
    [deltaPedidosCerrados]
  );

  const deltaMetaIngresos = useMemo(
    () => getDeltaMeta(deltaIngresos),
    [deltaIngresos]
  );

  const deltaMetaTicketProm = useMemo(
    () => getDeltaMeta(deltaTicketProm),
    [deltaTicketProm]
  );

  const deltaMetaCancelacion = useMemo(
    () => getDeltaMeta(deltaCancelacion, true),
    [deltaCancelacion]
  );

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

  const canalLider = useMemo(() => {
    if (canales.length === 0) return null;

    return [...canales].sort((a, b) => {
      if (b.ingresos !== a.ingresos) return b.ingresos - a.ingresos;
      return b.cantidad - a.cantidad;
    })[0];
  }, [canales]);

  const marcaLider = useMemo(() => {
    if (ventasPorMarca.length === 0) return null;

    return [...ventasPorMarca].sort((a, b) => {
      if (b.ingresos !== a.ingresos) return b.ingresos - a.ingresos;
      if (b.unidades !== a.unidades) return b.unidades - a.unidades;
      return b.pedidos - a.pedidos;
    })[0];
  }, [ventasPorMarca]);

  const comparativaCanalesMap = useMemo(() => {
    return new Map(
      (comparativa?.canales ?? []).map((canal) => [canal.canal, canal])
    );
  }, [comparativa]);

  const comparativaMarcasMap = useMemo(() => {
    return new Map(
      (comparativa?.marcas ?? []).map((marca) => [getMarcaKey(marca), marca])
    );
  }, [comparativa]);

  const getCanalComparativo = useCallback(
    (canalCode: RowCanal['canal']) => {
      return comparativaCanalesMap.get(canalCode) ?? null;
    },
    [comparativaCanalesMap]
  );

  const getCanalDeltaPedidos = useCallback(
    (canal: RowCanal) => {
      const previo = getCanalComparativo(canal.canal);
      return getDeltaPct(canal.cantidad, previo?.cantidad);
    },
    [getCanalComparativo]
  );

  const getCanalDeltaIngresos = useCallback(
    (canal: RowCanal) => {
      const previo = getCanalComparativo(canal.canal);
      return getDeltaPct(canal.ingresos, previo?.ingresos);
    },
    [getCanalComparativo]
  );

  const getMarcaComparativa = useCallback(
    (marca: RowMarca) => {
      return comparativaMarcasMap.get(getMarcaKey(marca)) ?? null;
    },
    [comparativaMarcasMap]
  );

  const getMarcaDeltaPedidos = useCallback(
    (marca: RowMarca) => {
      const previo = getMarcaComparativa(marca);
      return getDeltaPct(marca.pedidos, previo?.pedidos);
    },
    [getMarcaComparativa]
  );

  const getMarcaDeltaUnidades = useCallback(
    (marca: RowMarca) => {
      const previo = getMarcaComparativa(marca);
      return getDeltaPct(marca.unidades, previo?.unidades);
    },
    [getMarcaComparativa]
  );

  const getMarcaDeltaIngresos = useCallback(
    (marca: RowMarca) => {
      const previo = getMarcaComparativa(marca);
      return getDeltaPct(marca.ingresos, previo?.ingresos);
    },
    [getMarcaComparativa]
  );

  const maxIngresosMarca = useMemo(() => {
    return ventasPorMarca.reduce((max, row) => Math.max(max, row.ingresos), 0);
  }, [ventasPorMarca]);

  const alertaPrincipal = useMemo(() => {
    if (kpiPedidosTotal === 0) {
      return {
        titulo: 'Sin datos suficientes',
        detalle:
          'Todavía no hay actividad suficiente en el rango para detectar una alerta principal.',
        tone: 'border-slate-200 bg-slate-50 text-slate-700',
      };
    }

    if ((porcentajeCancelacion ?? 0) >= 12) {
      return {
        titulo: 'Cancelación alta',
        detalle: `La cancelación está en ${porcentajeCancelacion}%. Conviene revisar causas de pérdida y tiempos de respuesta.`,
        tone: 'border-rose-200 bg-rose-50 text-rose-700',
      };
    }

    if ((promTotal ?? 0) >= 25) {
      return {
        titulo: 'Demora operativa alta',
        detalle: `El tiempo promedio total hasta listo es ${promTotal} min. Hay señales de cuello de botella.`,
        tone: 'border-rose-200 bg-rose-50 text-rose-700',
      };
    }

    if ((promTotal ?? 0) >= 18) {
      return {
        titulo: 'Demora moderada',
        detalle: `El tiempo promedio total está en ${promTotal} min. Hay margen para mejorar rotación y fluidez.`,
        tone: 'border-amber-200 bg-amber-50 text-amber-700',
      };
    }

    return {
      titulo: 'Operación estable',
      detalle:
        'No aparecen alertas fuertes en el período. La operación muestra señales saludables.',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }, [kpiPedidosTotal, porcentajeCancelacion, promTotal]);

  const outliers = useMemo(() => {
    return tiempos
      .filter((t) => (t.min_total_hasta_listo ?? 0) >= 30)
      .sort(
        (a, b) =>
          (b.min_total_hasta_listo ?? 0) - (a.min_total_hasta_listo ?? 0)
      )
      .slice(0, 10);
  }, [tiempos]);

  const maxPedidosSerie = useMemo(() => {
    return serieDiaria.reduce((max, row) => Math.max(max, row.pedidos), 0);
  }, [serieDiaria]);

  const maxIngresosSerie = useMemo(() => {
    return serieDiaria.reduce((max, row) => Math.max(max, row.ingresos), 0);
  }, [serieDiaria]);

  const exportarCsv = useCallback(() => {
    const lines: string[] = [];

    lines.push(buildCsvLine(['RestoSmart Analytics']));
    lines.push(buildCsvLine(['Rango actual', `${desde} → ${hasta}`]));
    lines.push(
      buildCsvLine([
        'Rango comparado',
        comparativa
          ? `${comparativa.desde} → ${comparativa.hasta}`
          : 'Sin base comparable',
      ])
    );
    lines.push(buildCsvLine(['Exportado en', new Date().toLocaleString('es-AR')]));
    lines.push('');

    lines.push(buildCsvLine(['KPIs']));
    lines.push(buildCsvLine(['Indicador', 'Valor actual', 'Comparación']));
    lines.push(buildCsvLine(['Pedidos totales', kpiPedidosTotal, formatDelta(deltaPedidosTotal)]));
    lines.push(buildCsvLine(['Pedidos cerrados', kpiPedidosCerrados, formatDelta(deltaPedidosCerrados)]));
    lines.push(buildCsvLine(['Ingresos', formatCurrency(kpiIngresos), formatDelta(deltaIngresos)]));
    lines.push(
      buildCsvLine([
        'Ticket promedio',
        kpiTicketProm == null ? '—' : formatCurrency(kpiTicketProm),
        formatDelta(deltaTicketProm),
      ])
    );
    lines.push(
      buildCsvLine([
        '% cancelación',
        porcentajeCancelacion == null ? '—' : `${porcentajeCancelacion}%`,
        formatDelta(deltaCancelacion),
      ])
    );
    lines.push('');

    lines.push(buildCsvLine(['Ventas por canal']));
    lines.push(buildCsvLine(['Canal', 'Pedidos', 'Var. pedidos', 'Ingresos', 'Var. ingresos']));
    for (const canal of canales) {
      lines.push(
        buildCsvLine([
          formatCanalLabel(canal.canal),
          canal.cantidad,
          formatShortDeltaLabel('Pedidos', getCanalDeltaPedidos(canal)),
          formatCurrency(canal.ingresos),
          formatShortDeltaLabel('Ingresos', getCanalDeltaIngresos(canal)),
        ])
      );
    }
    lines.push('');

    lines.push(buildCsvLine(['Desempeño por marca']));
    lines.push(
      buildCsvLine([
        'Marca',
        'Pedidos',
        'Var. pedidos',
        'Unidades',
        'Var. unidades',
        'Ingresos',
        'Var. ingresos',
        'Color',
      ])
    );
    for (const marca of ventasPorMarca) {
      lines.push(
        buildCsvLine([
          getMarcaLabel(marca),
          marca.pedidos,
          formatShortDeltaLabel('Pedidos', getMarcaDeltaPedidos(marca)),
          marca.unidades,
          formatShortDeltaLabel('Unidades', getMarcaDeltaUnidades(marca)),
          formatCurrency(marca.ingresos),
          formatShortDeltaLabel('Ingresos', getMarcaDeltaIngresos(marca)),
          marca.marca_color_hex ?? '',
        ])
      );
    }
    lines.push('');

    lines.push(buildCsvLine(['Pedidos por hora']));
    lines.push(buildCsvLine(['Hora', 'Pedidos']));
    for (const row of pedidosHora) {
      lines.push(buildCsvLine([formatDateTime(row.hora), row.pedidos]));
    }
    lines.push('');

    lines.push(buildCsvLine(['Top productos']));
    lines.push(buildCsvLine(['Producto', 'Unidades', 'Ingresos']));
    for (const row of topProductos) {
      lines.push(
        buildCsvLine([
          row.producto_nombre,
          row.unidades,
          formatCurrency(row.ingresos),
        ])
      );
    }
    lines.push('');

    lines.push(buildCsvLine(['Outliers']));
    lines.push(
      buildCsvLine([
        'Pedido',
        'Mesa',
        'Creado',
        'Total min',
        'Mozo',
        'Cola',
        'Preparación',
      ])
    );
    for (const row of outliers) {
      lines.push(
        buildCsvLine([
          `#${row.pedido_id}`,
          row.mesa_id,
          formatDateTime(row.creado_en),
          row.min_total_hasta_listo ?? '—',
          row.min_mozo_confirma ?? '—',
          row.min_espera_cocina ?? '—',
          row.min_preparacion ?? '—',
        ])
      );
    }

    const csvContent = `\ufeff${lines.join('\n')}`;
    const blob = new Blob([csvContent], {
      type: 'text/csv;charset=utf-8;',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analytics-${desde}-a-${hasta}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [
    desde,
    hasta,
    comparativa,
    kpiPedidosTotal,
    kpiPedidosCerrados,
    kpiIngresos,
    kpiTicketProm,
    porcentajeCancelacion,
    deltaPedidosTotal,
    deltaPedidosCerrados,
    deltaIngresos,
    deltaTicketProm,
    deltaCancelacion,
    canales,
    ventasPorMarca,
    pedidosHora,
    topProductos,
    outliers,
    getCanalDeltaPedidos,
    getCanalDeltaIngresos,
    getMarcaDeltaPedidos,
    getMarcaDeltaUnidades,
    getMarcaDeltaIngresos,
  ]);

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

    if (marcaLider) {
      items.push(
        `La marca con mejor desempeño fue ${getMarcaLabel(marcaLider)}, con ${marcaLider.unidades} unidades y ${formatCurrency(marcaLider.ingresos)} de ingresos.`
      );
    }

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
  }, [horaPico, porcentajeCancelacion, productoLider, marcaLider, promTotal]);

  const resumenComparativo = useMemo(() => {
    const items: string[] = [];

    if (deltaIngresos != null) {
      if (deltaIngresos > 0) {
        items.push(`Los ingresos crecieron ${deltaIngresos}% frente al período anterior.`);
      } else if (deltaIngresos < 0) {
        items.push(`Los ingresos cayeron ${Math.abs(deltaIngresos)}% frente al período anterior.`);
      } else {
        items.push('Los ingresos se mantuvieron estables frente al período anterior.');
      }
    }

    if (deltaPedidosTotal != null) {
      if (deltaPedidosTotal > 0) {
        items.push(`El volumen de pedidos subió ${deltaPedidosTotal}%, señal de mayor demanda.`);
      } else if (deltaPedidosTotal < 0) {
        items.push(`El volumen de pedidos bajó ${Math.abs(deltaPedidosTotal)}%, conviene revisar la demanda del período.`);
      }
    }

    if (deltaTicketProm != null) {
      if (deltaTicketProm > 0) {
        items.push(`El ticket promedio mejoró ${deltaTicketProm}%, una señal positiva de valor por pedido.`);
      } else if (deltaTicketProm < 0) {
        items.push(`El ticket promedio cayó ${Math.abs(deltaTicketProm)}%, conviene revisar mezcla de productos y upselling.`);
      }
    }

    if (deltaCancelacion != null) {
      if (deltaCancelacion < 0) {
        items.push(`La cancelación bajó ${Math.abs(deltaCancelacion)}%, una mejora operativa importante.`);
      } else if (deltaCancelacion > 0) {
        items.push(`La cancelación subió ${deltaCancelacion}%, conviene revisar tiempos y causas de pérdida.`);
      }
    }

    if (items.length === 0) {
      items.push(
        'Todavía no hay suficiente base comparable para construir un resumen ejecutivo del período.'
      );
    }

    return items.slice(0, 4);
  }, [
    deltaIngresos,
    deltaPedidosTotal,
    deltaTicketProm,
    deltaCancelacion,
  ]);

  const senalesEjecutivas = useMemo<ExecutiveSignalRow[]>(() => {
    const rows: ExecutiveSignalRow[] = [];

    rows.push({
      id: 'ingresos',
      indicador: 'Ingresos',
      valorActual: formatCurrency(kpiIngresos),
      variacion: formatDelta(deltaIngresos),
      estado:
        deltaIngresos == null
          ? 'neutral'
          : deltaIngresos > 0
            ? 'positivo'
            : deltaIngresos < 0
              ? 'alerta'
              : 'neutral',
      lectura:
        deltaIngresos == null
          ? 'Todavía no hay base comparable suficiente.'
          : deltaIngresos > 0
            ? 'El negocio facturó más que en el período anterior.'
            : deltaIngresos < 0
              ? 'La facturación cayó y conviene revisar demanda y ticket.'
              : 'La facturación se mantuvo estable.',
    });

    rows.push({
      id: 'pedidos',
      indicador: 'Volumen de pedidos',
      valorActual: String(kpiPedidosTotal),
      variacion: formatDelta(deltaPedidosTotal),
      estado:
        deltaPedidosTotal == null
          ? 'neutral'
          : deltaPedidosTotal > 0
            ? 'positivo'
            : deltaPedidosTotal < 0
              ? 'alerta'
              : 'neutral',
      lectura:
        deltaPedidosTotal == null
          ? 'Todavía no hay base comparable suficiente.'
          : deltaPedidosTotal > 0
            ? 'Entraron más pedidos que en el período anterior.'
            : deltaPedidosTotal < 0
              ? 'Entraron menos pedidos; conviene mirar demanda y conversión.'
              : 'El volumen de pedidos se mantuvo estable.',
    });

    rows.push({
      id: 'ticket',
      indicador: 'Ticket promedio',
      valorActual:
        kpiTicketProm == null ? '—' : formatCurrency(kpiTicketProm),
      variacion: formatDelta(deltaTicketProm),
      estado:
        deltaTicketProm == null
          ? 'neutral'
          : deltaTicketProm > 0
            ? 'positivo'
            : deltaTicketProm < 0
              ? 'estable'
              : 'neutral',
      lectura:
        deltaTicketProm == null
          ? 'Todavía no hay base comparable suficiente.'
          : deltaTicketProm > 0
            ? 'Cada pedido está dejando más valor que antes.'
            : deltaTicketProm < 0
              ? 'El valor por pedido bajó; conviene revisar mezcla y upselling.'
              : 'El ticket promedio se mantuvo estable.',
    });

    rows.push({
      id: 'cancelacion',
      indicador: 'Cancelación',
      valorActual:
        porcentajeCancelacion == null ? '—' : `${porcentajeCancelacion}%`,
      variacion: formatDelta(deltaCancelacion),
      estado:
        deltaCancelacion == null
          ? 'neutral'
          : deltaCancelacion < 0
            ? 'positivo'
            : deltaCancelacion > 0
              ? 'alerta'
              : 'neutral',
      lectura:
        deltaCancelacion == null
          ? 'Todavía no hay base comparable suficiente.'
          : deltaCancelacion < 0
            ? 'La cancelación bajó, una mejora clara de la operación.'
            : deltaCancelacion > 0
              ? 'La cancelación subió; conviene revisar demoras y causas de pérdida.'
              : 'La cancelación se mantuvo estable.',
    });

    rows.push({
      id: 'tiempo-total',
      indicador: 'Tiempo total hasta listo',
      valorActual: promTotal == null ? '—' : `${promTotal} min`,
      variacion: 'Semáforo operativo',
      estado:
        promTotal == null
          ? 'neutral'
          : promTotal >= 25
            ? 'alerta'
            : promTotal >= 18
              ? 'estable'
              : 'positivo',
      lectura:
        promTotal == null
          ? 'No hay datos suficientes para evaluar tiempos.'
          : promTotal >= 25
            ? 'La operación muestra una demora alta.'
            : promTotal >= 18
              ? 'La operación está aceptable, pero con margen de mejora.'
              : 'La operación está fluyendo bien.',
    });

    const canalMasDinamico = [...canales]
      .map((canal) => ({
        canal,
        deltaIngresos: getCanalDeltaIngresos(canal),
      }))
      .filter((item) => item.deltaIngresos != null)
      .sort(
        (a, b) =>
          Number(b.deltaIngresos ?? Number.NEGATIVE_INFINITY) -
          Number(a.deltaIngresos ?? Number.NEGATIVE_INFINITY)
      )[0];

    rows.push({
      id: 'canal-dinamico',
      indicador: 'Canal más dinámico',
      valorActual: canalMasDinamico
        ? formatCanalLabel(canalMasDinamico.canal.canal)
        : 'Sin datos',
      variacion: canalMasDinamico
        ? formatShortDeltaLabel(
            'Ingresos',
            canalMasDinamico.deltaIngresos
          )
        : 'Sin base comparable',
      estado:
        canalMasDinamico?.deltaIngresos == null
          ? 'neutral'
          : canalMasDinamico.deltaIngresos > 0
            ? 'positivo'
            : canalMasDinamico.deltaIngresos < 0
              ? 'alerta'
              : 'neutral',
      lectura:
        canalMasDinamico?.deltaIngresos == null
          ? 'Todavía no hay base comparable suficiente por canal.'
          : canalMasDinamico.deltaIngresos > 0
            ? `El canal ${formatCanalLabel(canalMasDinamico.canal.canal)} es el que más está empujando el crecimiento.`
            : canalMasDinamico.deltaIngresos < 0
              ? `El canal ${formatCanalLabel(canalMasDinamico.canal.canal)} está perdiendo tracción.`
              : 'No hay un canal con cambio relevante en el período.',
    });

    if (marcaLider) {
      const deltaMarcaLider = getMarcaDeltaIngresos(marcaLider);

      rows.push({
        id: 'marca-lider',
        indicador: 'Marca líder',
        valorActual: getMarcaLabel(marcaLider),
        variacion: formatShortDeltaLabel('Ingresos', deltaMarcaLider),
        estado:
          deltaMarcaLider == null
            ? 'neutral'
            : deltaMarcaLider > 0
              ? 'positivo'
              : deltaMarcaLider < 0
                ? 'alerta'
                : 'neutral',
        lectura:
          deltaMarcaLider == null
            ? `${getMarcaLabel(marcaLider)} lidera el período, sin base comparable suficiente.`
            : deltaMarcaLider > 0
              ? `${getMarcaLabel(marcaLider)} lidera y además crece frente al período anterior.`
              : deltaMarcaLider < 0
                ? `${getMarcaLabel(marcaLider)} lidera, pero facturó menos que en el período anterior.`
                : `${getMarcaLabel(marcaLider)} lidera con ingresos estables frente al período anterior.`,
      });
    }

    return rows;
  }, [
    kpiIngresos,
    deltaIngresos,
    kpiPedidosTotal,
    deltaPedidosTotal,
    kpiTicketProm,
    deltaTicketProm,
    porcentajeCancelacion,
    deltaCancelacion,
    promTotal,
    canales,
    getCanalDeltaIngresos,
    marcaLider,
    getMarcaDeltaIngresos,
  ]);

  const exportarXlsx = useCallback(() => {
    const wb = utils.book_new();

    const resumenRows = [
      {
        indicador: 'Rango actual',
        valor: `${desde} → ${hasta}`,
        comparacion: '',
      },
      {
        indicador: 'Rango comparado',
        valor: comparativa
          ? `${comparativa.desde} → ${comparativa.hasta}`
          : 'Sin base comparable',
        comparacion: '',
      },
      {
        indicador: 'Pedidos totales',
        valor: kpiPedidosTotal,
        comparacion: formatDelta(deltaPedidosTotal),
      },
      {
        indicador: 'Pedidos cerrados',
        valor: kpiPedidosCerrados,
        comparacion: formatDelta(deltaPedidosCerrados),
      },
      {
        indicador: 'Ingresos',
        valor: kpiIngresos,
        comparacion: formatDelta(deltaIngresos),
      },
      {
        indicador: 'Ticket promedio',
        valor: kpiTicketProm ?? '',
        comparacion: formatDelta(deltaTicketProm),
      },
      {
        indicador: '% cancelación',
        valor: porcentajeCancelacion ?? '',
        comparacion: formatDelta(deltaCancelacion),
      },
      {
        indicador: 'Exportado en',
        valor: new Date().toLocaleString('es-AR'),
        comparacion: '',
      },
    ];

    const canalesRows = canales.map((canal) => ({
      canal: formatCanalLabel(canal.canal),
      pedidos: canal.cantidad,
      var_pedidos: getCanalDeltaPedidos(canal),
      ingresos: canal.ingresos,
      var_ingresos: getCanalDeltaIngresos(canal),
    }));

    const marcasRows = ventasPorMarca.map((marca) => ({
      marca: getMarcaLabel(marca),
      pedidos: marca.pedidos,
      var_pedidos: getMarcaDeltaPedidos(marca),
      unidades: marca.unidades,
      var_unidades: getMarcaDeltaUnidades(marca),
      ingresos: marca.ingresos,
      var_ingresos: getMarcaDeltaIngresos(marca),
      color: marca.marca_color_hex ?? '',
      logo: marca.marca_logo_url ?? '',
    }));

    const pedidosHoraRows = pedidosHora.map((row) => ({
      hora: formatDateTime(row.hora),
      pedidos: row.pedidos,
    }));

    const productosRows = topProductos.map((row) => ({
      producto: row.producto_nombre,
      unidades: row.unidades,
      ingresos: row.ingresos,
    }));

    const outliersRows = outliers.map((row) => ({
      pedido: row.pedido_id,
      mesa: row.mesa_id,
      creado: formatDateTime(row.creado_en),
      total_min: row.min_total_hasta_listo ?? '',
      mozo: row.min_mozo_confirma ?? '',
      cola: row.min_espera_cocina ?? '',
      preparacion: row.min_preparacion ?? '',
    }));

    const serieDiariaRows = serieDiaria.map((row) => ({
      fecha: row.fecha,
      pedidos: row.pedidos,
      cerrados: row.cerrados,
      cancelados: row.cancelados,
      ingresos: row.ingresos,
    }));

    const wsResumen = utils.json_to_sheet(resumenRows);
    const wsCanales = utils.json_to_sheet(canalesRows);
    const wsMarcas = utils.json_to_sheet(marcasRows);
    const wsPedidosHora = utils.json_to_sheet(pedidosHoraRows);
    const wsProductos = utils.json_to_sheet(productosRows);
    const wsOutliers = utils.json_to_sheet(outliersRows);
    const wsSerieDiaria = utils.json_to_sheet(serieDiariaRows);

    utils.book_append_sheet(wb, wsResumen, 'Resumen');
    utils.book_append_sheet(wb, wsCanales, 'Canales');
    utils.book_append_sheet(wb, wsMarcas, 'Marcas');
    utils.book_append_sheet(wb, wsSerieDiaria, 'Tendencia');
    utils.book_append_sheet(wb, wsPedidosHora, 'Pedidos por hora');
    utils.book_append_sheet(wb, wsProductos, 'Top productos');
    utils.book_append_sheet(wb, wsOutliers, 'Outliers');

    writeFileXLSX(wb, `analytics-${desde}-a-${hasta}.xlsx`);
  }, [
    desde,
    hasta,
    comparativa,
    kpiPedidosTotal,
    kpiPedidosCerrados,
    kpiIngresos,
    kpiTicketProm,
    porcentajeCancelacion,
    deltaPedidosTotal,
    deltaPedidosCerrados,
    deltaIngresos,
    deltaTicketProm,
    deltaCancelacion,
    canales,
    ventasPorMarca,
    pedidosHora,
    topProductos,
    outliers,
    serieDiaria,
    getCanalDeltaPedidos,
    getCanalDeltaIngresos,
    getMarcaDeltaPedidos,
    getMarcaDeltaUnidades,
    getMarcaDeltaIngresos,
  ]);

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
                  <li>• Desempeño por marca</li>
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
                  cuándo se concentra la demanda, qué marca rinde mejor y qué
                  señales conviene atacar primero.
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
              KPIs operativos, marcas y lectura ejecutiva basados en pedidos reales.
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

            <button
              onClick={exportarCsv}
              disabled={loading}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Exportar CSV
            </button>

            <button
              onClick={exportarXlsx}
              disabled={loading}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Exportar Excel
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
            <section className="grid gap-3 xl:grid-cols-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Canal líder
                </div>

                <div className="mt-2 text-lg font-bold text-slate-900">
                  {canalLider ? formatCanalLabel(canalLider.canal) : 'Sin datos'}
                </div>

                <p className="mt-2 text-sm text-slate-600">
                  {canalLider
                    ? `${formatCurrency(canalLider.ingresos)} · ${canalLider.cantidad} pedidos`
                    : 'Todavía no hay datos para comparar canales.'}
                </p>
              </div>

              <div
                className="rounded-2xl border bg-white p-4"
                style={
                  marcaLider
                    ? {
                        borderColor: getMarcaColor(marcaLider),
                        boxShadow: `inset 4px 0 0 ${getMarcaColor(marcaLider)}`,
                      }
                    : undefined
                }
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Marca líder
                </div>

                <div className="mt-2 flex items-center gap-2">
                  {marcaLider?.marca_logo_url ? (
                    <img
                      src={marcaLider.marca_logo_url}
                      alt={getMarcaLabel(marcaLider)}
                      className="h-8 w-8 rounded-full border border-slate-200 object-cover"
                    />
                  ) : marcaLider ? (
                    <span
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: getMarcaColor(marcaLider) }}
                    >
                      {getMarcaLabel(marcaLider).slice(0, 1).toUpperCase()}
                    </span>
                  ) : null}

                  <div className="text-lg font-bold text-slate-900">
                    {marcaLider ? getMarcaLabel(marcaLider) : 'Sin datos'}
                  </div>
                </div>

                <p className="mt-2 text-sm text-slate-600">
                  {marcaLider
                    ? `${formatCurrency(marcaLider.ingresos)} · ${marcaLider.unidades} unidades`
                    : 'Todavía no hay ventas por marca.'}
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

              <div className={`rounded-2xl border p-4 ${alertaPrincipal.tone}`}>
                <div className="text-xs font-semibold uppercase tracking-wide">
                  Alerta principal
                </div>

                <div className="mt-2 text-lg font-bold">
                  {alertaPrincipal.titulo}
                </div>

                <p className="mt-2 text-sm leading-relaxed">
                  {alertaPrincipal.detalle}
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Salud operativa
                  </div>
                  <div className="mt-2 text-2xl font-bold text-slate-900">
                    {estadoOperacion.label}
                  </div>
                </div>

                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${estadoOperacion.tone}`}
                >
                  Estado del período
                </span>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                {estadoOperacion.description}
              </p>
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
                <div className="flex flex-col items-end gap-1">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                    {desde} → {hasta}
                  </span>

                  {comparativa && (
                    <span className="text-xs text-slate-500">
                      comparado con {comparativa.desde} → {comparativa.hasta}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                  Resumen ejecutivo comparativo
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {resumenComparativo.map((item) => (
                    <div
                      key={item}
                      className="rounded-xl border border-violet-200 bg-white p-3 text-sm leading-relaxed text-slate-700"
                    >
                      {item}
                    </div>
                  ))}
                </div>
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

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3">
                <h2 className="font-semibold text-slate-900">
                  Qué sube / qué baja
                </h2>
                <p className="text-sm text-slate-500">
                  Lectura ejecutiva automática de los indicadores más relevantes.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-2 pr-4">Indicador</th>
                      <th className="py-2 pr-4">Valor actual</th>
                      <th className="py-2 pr-4">Variación</th>
                      <th className="py-2 pr-4">Semáforo</th>
                      <th className="py-2">Lectura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {senalesEjecutivas.map((row) => (
                      <tr key={row.id} className="border-t align-top">
                        <td className="py-3 pr-4 font-semibold text-slate-900">
                          {row.indicador}
                        </td>

                        <td className="py-3 pr-4 text-slate-700">
                          {row.valorActual}
                        </td>

                        <td className="py-3 pr-4 text-slate-700">
                          {row.variacion}
                        </td>

                        <td className="py-3 pr-4">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getExecutiveSignalClasses(row.estado)}`}
                          >
                            {row.estado === 'positivo'
                              ? 'Positivo'
                              : row.estado === 'alerta'
                                ? 'Alerta'
                                : row.estado === 'estable'
                                  ? 'A seguir'
                                  : 'Neutral'}
                          </span>
                        </td>

                        <td className="py-3 text-slate-700">{row.lectura}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-500">Pedidos totales</div>
                <div className="text-xl font-bold">{kpiPedidosTotal}</div>
                <div
                  className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${deltaMetaPedidosTotal.className}`}
                >
                  <span>{deltaMetaPedidosTotal.icon}</span>
                  <span>{deltaMetaPedidosTotal.label}</span>
                </div>
                <div
                  className={`mt-1 text-xs font-medium ${getDeltaTone(deltaPedidosTotal)}`}
                >
                  {formatDelta(deltaPedidosTotal)}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-500">Pedidos cerrados</div>
                <div className="text-xl font-bold">{kpiPedidosCerrados}</div>
                <div
                  className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${deltaMetaPedidosCerrados.className}`}
                >
                  <span>{deltaMetaPedidosCerrados.icon}</span>
                  <span>{deltaMetaPedidosCerrados.label}</span>
                </div>
                <div
                  className={`mt-1 text-xs font-medium ${getDeltaTone(deltaPedidosCerrados)}`}
                >
                  {formatDelta(deltaPedidosCerrados)}
                </div>
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
                <div
                  className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${deltaMetaIngresos.className}`}
                >
                  <span>{deltaMetaIngresos.icon}</span>
                  <span>{deltaMetaIngresos.label}</span>
                </div>
                <div
                  className={`mt-1 text-xs font-medium ${getDeltaTone(deltaIngresos)}`}
                >
                  {formatDelta(deltaIngresos)}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3 md:col-span-2">
                <div className="text-xs text-slate-500">
                  Ticket promedio (cerrados)
                </div>
                <div className="text-xl font-bold">
                  {kpiTicketProm == null ? '—' : formatCurrency(kpiTicketProm)}
                </div>
                <div
                  className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${deltaMetaTicketProm.className}`}
                >
                  <span>{deltaMetaTicketProm.icon}</span>
                  <span>{deltaMetaTicketProm.label}</span>
                </div>
                <div
                  className={`mt-1 text-xs font-medium ${getDeltaTone(deltaTicketProm)}`}
                >
                  {formatDelta(deltaTicketProm)}
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
                <div
                  className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${deltaMetaCancelacion.className}`}
                >
                  <span>{deltaMetaCancelacion.icon}</span>
                  <span>{deltaMetaCancelacion.label}</span>
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
                  {canales.map((canal) => {
                    const deltaPedidos = getCanalDeltaPedidos(canal);
                    const deltaIngresosCanal = getCanalDeltaIngresos(canal);

                    const metaPedidos = getDeltaMeta(deltaPedidos);
                    const metaIngresos = getDeltaMeta(deltaIngresosCanal);

                    return (
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

                        <div className="mt-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${metaPedidos.className}`}
                          >
                            <span>{metaPedidos.icon}</span>
                            <span>{formatShortDeltaLabel('Pedidos', deltaPedidos)}</span>
                          </span>
                        </div>

                        <div className="mt-4 text-lg font-semibold text-slate-900">
                          {formatCurrency(canal.ingresos)}
                        </div>

                        <div className="text-sm text-slate-500">ingresos cerrados</div>

                        <div className="mt-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${metaIngresos.className}`}
                          >
                            <span>{metaIngresos.icon}</span>
                            <span>{formatShortDeltaLabel('Ingresos', deltaIngresosCanal)}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    Desempeño por marca
                  </h2>
                  <p className="text-sm text-slate-500">
                    Ingresos, pedidos y unidades agrupados por marca. Los colores
                    usan la configuración elegida en Marcas.
                  </p>
                </div>

                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  {ventasPorMarca.length} marca{ventasPorMarca.length === 1 ? '' : 's'}
                </span>
              </div>

              {ventasPorMarca.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                  Sin datos por marca. Revisá que los productos tengan marca asignada
                  y que el endpoint devuelva <code>ventasPorMarca</code>.
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {ventasPorMarca.map((marca) => {
                    const color = getMarcaColor(marca);
                    const deltaPedidosMarca = getMarcaDeltaPedidos(marca);
                    const deltaUnidadesMarca = getMarcaDeltaUnidades(marca);
                    const deltaIngresosMarca = getMarcaDeltaIngresos(marca);
                    const metaIngresos = getDeltaMeta(deltaIngresosMarca);
                    const width = getTrendBarWidth(
                      marca.ingresos,
                      maxIngresosMarca
                    );

                    return (
                      <article
                        key={getMarcaKey(marca)}
                        className="overflow-hidden rounded-2xl border bg-white shadow-sm"
                        style={{
                          borderColor: color,
                          boxShadow: `inset 5px 0 0 ${color}`,
                        }}
                      >
                        <div
                          className="p-4"
                          style={{ backgroundColor: hexToRgba(color, 0.07) }}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              {marca.marca_logo_url ? (
                                <img
                                  src={marca.marca_logo_url}
                                  alt={getMarcaLabel(marca)}
                                  className="h-12 w-12 rounded-2xl border border-white bg-white object-cover shadow-sm"
                                />
                              ) : (
                                <span
                                  className="inline-flex h-12 w-12 items-center justify-center rounded-2xl text-base font-bold text-white shadow-sm"
                                  style={{ backgroundColor: color }}
                                >
                                  {getMarcaLabel(marca).slice(0, 1).toUpperCase()}
                                </span>
                              )}

                              <div className="min-w-0">
                                <h3 className="truncate text-base font-bold text-slate-900">
                                  {getMarcaLabel(marca)}
                                </h3>
                                <p className="mt-0.5 text-xs text-slate-600">
                                  {marca.pedidos} pedido
                                  {marca.pedidos === 1 ? '' : 's'} ·{' '}
                                  {marca.unidades} unidad
                                  {marca.unidades === 1 ? '' : 'es'}
                                </p>
                              </div>
                            </div>

                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${metaIngresos.className}`}
                            >
                              <span>{metaIngresos.icon}</span>
                              <span>{formatShortDeltaLabel('Ingresos', deltaIngresosMarca)}</span>
                            </span>
                          </div>

                          <div className="mt-4">
                            <div className="flex items-center justify-between text-xs text-slate-600">
                              <span>Ingresos cerrados</span>
                              <span className="font-semibold text-slate-900">
                                {formatCurrency(marca.ingresos)}
                              </span>
                            </div>

                            <div className="mt-2 h-2 rounded-full bg-white/80">
                              <div
                                className="h-2 rounded-full"
                                style={{ width, backgroundColor: color }}
                              />
                            </div>
                          </div>

                          <div className="mt-4 grid gap-2 sm:grid-cols-3">
                            <div className="rounded-xl border border-white/70 bg-white/80 p-3">
                              <div className="text-[11px] text-slate-500">
                                Pedidos
                              </div>
                              <div className="text-lg font-bold text-slate-900">
                                {marca.pedidos}
                              </div>
                              <div
                                className={`text-[11px] font-medium ${getDeltaTone(deltaPedidosMarca)}`}
                              >
                                {formatShortDeltaLabel('Pedidos', deltaPedidosMarca)}
                              </div>
                            </div>

                            <div className="rounded-xl border border-white/70 bg-white/80 p-3">
                              <div className="text-[11px] text-slate-500">
                                Unidades
                              </div>
                              <div className="text-lg font-bold text-slate-900">
                                {marca.unidades}
                              </div>
                              <div
                                className={`text-[11px] font-medium ${getDeltaTone(deltaUnidadesMarca)}`}
                              >
                                {formatShortDeltaLabel('Unidades', deltaUnidadesMarca)}
                              </div>
                            </div>

                            <div className="rounded-xl border border-white/70 bg-white/80 p-3">
                              <div className="text-[11px] text-slate-500">
                                Ingresos
                              </div>
                              <div className="text-lg font-bold text-slate-900">
                                {formatCurrency(marca.ingresos)}
                              </div>
                              <div
                                className={`text-[11px] font-medium ${getDeltaTone(deltaIngresosMarca)}`}
                              >
                                {formatShortDeltaLabel('Ingresos', deltaIngresosMarca)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3">
                <h2 className="font-semibold text-slate-900">Tendencia diaria</h2>
                <p className="text-sm text-slate-500">
                  Evolución día por día de pedidos e ingresos dentro del rango.
                </p>
              </div>

              {serieDiaria.length === 0 ? (
                <p className="text-sm text-slate-600">Sin datos.</p>
              ) : (
                <div className="space-y-3">
                  {serieDiaria.map((row) => (
                    <div
                      key={row.fecha}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="text-sm font-semibold text-slate-900">
                          {row.fecha}
                        </div>

                        <div className="text-xs text-slate-500">
                          {row.pedidos} pedidos · {row.cerrados} cerrados ·{' '}
                          {row.cancelados} cancelados · {formatCurrency(row.ingresos)}
                        </div>
                      </div>

                      <div className="mt-3 space-y-2">
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                            <span>Pedidos</span>
                            <span>{row.pedidos}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-200">
                            <div
                              className="h-2 rounded-full bg-slate-900"
                              style={{
                                width: getTrendBarWidth(row.pedidos, maxPedidosSerie),
                              }}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                            <span>Ingresos</span>
                            <span>{formatCurrency(row.ingresos)}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-200">
                            <div
                              className="h-2 rounded-full bg-emerald-500"
                              style={{
                                width: getTrendBarWidth(row.ingresos, maxIngresosSerie),
                              }}
                            />
                          </div>
                        </div>
                      </div>
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