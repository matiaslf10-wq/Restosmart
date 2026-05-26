import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import {
  getFallbackAdminAccess,
  resolveAdminAccess,
  type AdminAccessResolutionOptions,
} from '@/lib/adminAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { canAccessAnalytics } from '@/lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CanalCode = 'salon' | 'takeaway' | 'delivery';

type CanalFilter = CanalCode | 'todos';

type RowPedidosHora = {
  hora: string;
  pedidos: number;
};

type RowTopProductos = {
  producto_id: number;
  producto_nombre: string;
  unidades: number;
  ingresos: number;
};

type RowCanal = {
  canal: CanalCode;
  cantidad: number;
  ingresos: number;
};

type RowMarca = {
  marca_id: string | null;
  marca_nombre: string;
  color_hex: string | null;
  logo_url: string | null;
  pedidos: number;
  unidades: number;
  ingresos: number;
};

type RowSerieDiaria = {
  fecha: string;
  pedidos: number;
  cerrados: number;
  cancelados: number;
  ingresos: number;
};

type RowHeatmapDiaHora = {
  dia: number;
  dia_label: string;
  hora: number;
  pedidos: number;
  cerrados: number;
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

type PedidoAnalyticsRow = {
  id: number;
  estado: string | null;
  creado_en: string;
  mesa_id: number | null;
  tipo_servicio: string | null;
  origen: string | null;
  total: number | null;
  items_pedido: unknown[] | null;
};

type MarcaRow = {
  id: string;
  nombre: string;
  color_hex: string | null;
  logo_url: string | null;
};

type AnalyticsRestaurantScope = {
  restaurantIds: string[];
  scopeUsed: string;
};

type RestaurantScopeRow = {
  id: string | number;
  slug: string | null;
  owner_tenant_id: string | null;
};

type PredictiveStockLevel = 'critico' | 'riesgo';

type PredictiveStockAlert = {
  restaurant_id: string;
  restaurant_label: string;
  producto_id: number;
  producto_nombre: string;
  categoria: string | null;
  stock_actual: number;
  demanda_esperada: number;
  faltante_estimado: number;
  fecha_objetivo: string;
  dia_objetivo: string;
  dias_hasta_objetivo: number;
  muestras_historicas: number;
  nivel: PredictiveStockLevel;
  lectura: string;
};

type PedidoStockHistoryRow = {
  id: number;
  restaurant_id: string | number | null;
  creado_en: string;
  estado: string | null;
  items_pedido: unknown[] | null;
};

type ProductoStockPredictiveRow = {
  restaurant_id: string | number | null;
  producto_id: number | null;
  control_stock: boolean | null;
  stock_actual: number | null;
  permitir_sin_stock: boolean | null;
  visible_en_menu: boolean | null;
  productos:
    | {
        id: number;
        nombre: string;
        categoria: string | null;
        disponible: boolean | null;
      }
    | {
        id: number;
        nombre: string;
        categoria: string | null;
        disponible: boolean | null;
      }[]
    | null;
};

type RestaurantOption = {
  id: string;
  slug: string;
  label: string;
  owner_tenant_id: string | null;
};

type StockEstado =
  | 'ok'
  | 'bajo'
  | 'agotado'
  | 'flexible'
  | 'sin_control';

type ProductoStockRow = {
  restaurant_id: string | number | null;
  producto_id: number | null;
  visible_en_menu: boolean | null;
  control_stock: boolean | null;
  stock_actual: number | null;
  permitir_sin_stock: boolean | null;
  productos:
    | {
        id: number;
        nombre: string;
        categoria: string | null;
        precio: number | null;
        disponible: boolean | null;
      }
    | {
        id: number;
        nombre: string;
        categoria: string | null;
        precio: number | null;
        disponible: boolean | null;
      }[]
    | null;
};

type StockProductoReport = {
  restaurant_id: string;
  restaurant_label: string;
  producto_id: number;
  producto_nombre: string;
  categoria: string | null;
  visible_en_menu: boolean;
  disponible: boolean;
  control_stock: boolean;
  stock_actual: number;
  permitir_sin_stock: boolean;
  estado: StockEstado;
};

type StockSucursalReport = {
  restaurant_id: string;
  restaurant_label: string;
  total_productos: number;
  controlados: number;
  agotados: number;
  bajos: number;
  flexibles: number;
  sin_control: number;
  ok: number;
  productos: StockProductoReport[];
};

type StockControlReport = {
  resumen: {
    total_productos: number;
    controlados: number;
    agotados: number;
    bajos: number;
    flexibles: number;
    sin_control: number;
    ok: number;
  };
  sucursales: StockSucursalReport[];
  criticos: StockProductoReport[];
};

const CLOSED_STATUSES = new Set(['cerrado', 'entregado', 'finalizado']);
const CANCELLED_STATUSES = new Set(['cancelado', 'cancelada']);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeNonEmptyString(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function pickFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = normalizeNonEmptyString(value);
    if (normalized) return normalized;
  }

  return null;
}

function extractRequestedTenantContext(
  request: NextRequest,
  session: unknown
): AdminAccessResolutionOptions {
  const sessionRecord = asRecord(session);
  const restaurantRecord = asRecord(sessionRecord?.restaurant);

  const tenantSlug = pickFirstString(
    request.nextUrl.searchParams.get('tenant'),
    request.nextUrl.searchParams.get('tenantSlug'),
    request.nextUrl.searchParams.get('slug'),
    request.headers.get('x-tenant-id'),
    request.headers.get('x-tenant-slug'),
    request.cookies.get('tenant')?.value,
    request.cookies.get('tenant_slug')?.value,
    restaurantRecord?.slug,
    sessionRecord?.tenantId,
    sessionRecord?.tenant_id,
    sessionRecord?.slug
  );

  const restaurantId = pickFirstString(
    request.nextUrl.searchParams.get('restaurantId'),
    request.nextUrl.searchParams.get('restaurant_id'),
    request.headers.get('x-restaurant-id'),
    request.cookies.get('restaurant_id')?.value,
    restaurantRecord?.id,
    sessionRecord?.restaurantId,
    sessionRecord?.restaurant_id
  );

  return {
    tenantSlug,
    restaurantId,
  };
}

function isValidDateInput(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatArDate(date: Date) {
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

function getDefaultDateRange() {
  const now = new Date();
  const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);

  return {
    desde: formatArDate(sevenDaysAgo),
    hasta: formatArDate(now),
  };
}

function toIsoStartOfDayAR(localDate: string) {
  return new Date(`${localDate}T00:00:00-03:00`).toISOString();
}

function toIsoEndOfDayAR(localDate: string) {
  return new Date(`${localDate}T23:59:59.999-03:00`).toISOString();
}

function safeRound(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeCanalFilter(value: unknown): CanalFilter {
  const raw = normalizeText(value);

  if (raw === 'salon') return 'salon';
  if (raw === 'takeaway') return 'takeaway';
  if (raw === 'delivery') return 'delivery';

  return 'todos';
}

function isClosedStatus(value: unknown) {
  return CLOSED_STATUSES.has(normalizeText(value));
}

function isCancelledStatus(value: unknown) {
  return CANCELLED_STATUSES.has(normalizeText(value));
}

function getItemCantidad(item: unknown): number {
  if (!item || typeof item !== 'object') return 0;
  return Number((item as { cantidad?: unknown }).cantidad ?? 0);
}

function getProductoRaw(item: unknown): unknown {
  if (!item || typeof item !== 'object') return null;
  return (item as { producto?: unknown }).producto ?? null;
}

function getProductoObject(item: unknown): Record<string, unknown> | null {
  const producto = getProductoRaw(item);

  if (Array.isArray(producto)) {
    return asRecord(producto[0]);
  }

  return asRecord(producto);
}

function getProductoPrecio(item: unknown): number {
  const producto = getProductoObject(item);
  return Number(producto?.precio ?? 0);
}

function getProductoNombre(item: unknown): string {
  const producto = getProductoObject(item);
  return String(producto?.nombre ?? 'Producto');
}

function getProductoId(item: unknown): number {
  const producto = getProductoObject(item);
  return Number(producto?.id ?? 0);
}

function getProductoMarcaId(item: unknown): string | null {
  const producto = getProductoObject(item);
  return normalizeNonEmptyString(producto?.marca_id);
}

function getSubtotalItemsPedido(pedido: PedidoAnalyticsRow): number {
  const items: unknown[] = Array.isArray(pedido.items_pedido)
    ? pedido.items_pedido
    : [];

  return safeRound(
    items.reduce((accItem: number, item: unknown) => {
      const cantidad = getItemCantidad(item);
      const precio = getProductoPrecio(item);
      return accItem + cantidad * precio;
    }, 0)
  );
}

function getIngresosPedido(pedido: PedidoAnalyticsRow): number {
  const total = Number(pedido.total);

  if (Number.isFinite(total) && total > 0) {
    return safeRound(total);
  }

  return getSubtotalItemsPedido(pedido);
}

function getPedidoCanal(
  pedido: Pick<PedidoAnalyticsRow, 'mesa_id' | 'tipo_servicio' | 'origen'>
): CanalCode {
  const tipoServicio = normalizeText(pedido.tipo_servicio);
  const origen = normalizeText(pedido.origen);

  const isTakeaway =
    tipoServicio === 'takeaway' ||
    tipoServicio === 'take_away' ||
    tipoServicio === 'pickup' ||
    tipoServicio === 'pick_up' ||
    tipoServicio === 'retiro' ||
    origen.includes('takeaway') ||
    origen.includes('take_away') ||
    origen.includes('pickup') ||
    origen.includes('pick_up') ||
    origen.includes('retiro');

  if (isTakeaway) {
    return 'takeaway';
  }

  const isDelivery =
    tipoServicio === 'delivery' ||
    tipoServicio === 'envio' ||
    origen.includes('delivery') ||
    origen.includes('envio');

  if (isDelivery) {
    return 'delivery';
  }

  return 'salon';
}

function getHourBucketIso(value: string) {
  const date = new Date(value);

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';

  return new Date(`${year}-${month}-${day}T${hour}:00:00-03:00`).toISOString();
}

function getDayBucket(value: string) {
  const date = new Date(value);

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

function buildDateRangeList(desde: string, hasta: string) {
  const result: string[] = [];
  const current = new Date(`${desde}T00:00:00-03:00`);
  const end = new Date(`${hasta}T00:00:00-03:00`);

  while (current.getTime() <= end.getTime()) {
    result.push(formatArDate(current));
    current.setDate(current.getDate() + 1);
  }

  return result;
}

const HEATMAP_DAYS = [
  { dia: 0, label: 'Lunes' },
  { dia: 1, label: 'Martes' },
  { dia: 2, label: 'Miércoles' },
  { dia: 3, label: 'Jueves' },
  { dia: 4, label: 'Viernes' },
  { dia: 5, label: 'Sábado' },
  { dia: 6, label: 'Domingo' },
];

const PREDICTIVE_HISTORY_DAYS = 56;
const PREDICTIVE_LOOKAHEAD_DAYS = 7;

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

const WEEKDAY_LABELS = [
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
  'domingo',
];

function addDaysToLocalDate(localDate: string, days: number) {
  const date = new Date(`${localDate}T00:00:00-03:00`);
  date.setDate(date.getDate() + days);
  return formatArDate(date);
}

function getWeekdayIndexAR(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'short',
  }).formatToParts(date);

  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Mon';

  return WEEKDAY_TO_INDEX[weekday] ?? 0;
}

function getProductoFromPredictiveStockRow(row: ProductoStockPredictiveRow) {
  if (Array.isArray(row.productos)) {
    return row.productos[0] ?? null;
  }

  return row.productos ?? null;
}

function getHistoryItemProductoId(item: unknown): number {
  const record = asRecord(item);
  if (!record) return 0;

  const directId = Number(record.producto_id ?? 0);
  if (directId > 0) return directId;

  const producto = asRecord(record.producto);
  return Number(producto?.id ?? 0);
}

function getDemandKey(params: {
  restaurantId: string;
  productoId: number;
  weekday: number;
}) {
  return `${params.restaurantId}:${params.productoId}:${params.weekday}`;
}

function buildRestaurantLabelMap(restaurants: RestaurantOption[]) {
  return new Map(
    restaurants.map((restaurant) => [
      String(restaurant.id),
      restaurant.label || restaurant.slug || `Sucursal ${restaurant.id}`,
    ])
  );
}

function getPredictionLevel(params: {
  stockActual: number;
  demandaEsperada: number;
}): PredictiveStockLevel | null {
  if (params.demandaEsperada <= 0) return null;

  if (params.stockActual <= 0) return 'critico';

  const cobertura = params.stockActual / params.demandaEsperada;

  if (cobertura < 0.5) return 'critico';
  if (cobertura < 0.9) return 'riesgo';

  return null;
}

async function loadPredictiveStockAlerts(params: {
  restaurantIds: string[];
  restaurantOptions: RestaurantOption[];
}): Promise<PredictiveStockAlert[]> {
  if (params.restaurantIds.length === 0) return [];

  const today = formatArDate(new Date());
  const historyStart = addDaysToLocalDate(today, -PREDICTIVE_HISTORY_DAYS);
  const historyEnd = today;

  const labelMap = buildRestaurantLabelMap(params.restaurantOptions);

  const weekdayOccurrences = new Map<number, number>();

  for (let index = 1; index <= PREDICTIVE_HISTORY_DAYS; index += 1) {
    const date = addDaysToLocalDate(today, -index);
    const weekday = getWeekdayIndexAR(`${date}T12:00:00-03:00`);
    weekdayOccurrences.set(weekday, (weekdayOccurrences.get(weekday) ?? 0) + 1);
  }

  const stockResult = await supabaseAdmin
    .from('producto_restaurantes')
    .select(
      `
      restaurant_id,
      producto_id,
      control_stock,
      stock_actual,
      permitir_sin_stock,
      visible_en_menu,
      productos (
        id,
        nombre,
        categoria,
        disponible
      )
    `
    )
    .in('restaurant_id', params.restaurantIds)
    .eq('control_stock', true)
    .order('restaurant_id', { ascending: true })
    .order('producto_id', { ascending: true });

  if (stockResult.error) {
    console.error('predictive stock current stock read error:', stockResult.error);
    return [];
  }

  const pedidosResult = await supabaseAdmin
    .from('pedidos')
    .select(
      `
      id,
      restaurant_id,
      creado_en,
      estado,
      items_pedido (
        cantidad,
        producto_id
      )
    `
    )
    .in('restaurant_id', params.restaurantIds)
    .gte('creado_en', toIsoStartOfDayAR(historyStart))
    .lt('creado_en', toIsoStartOfDayAR(historyEnd));

  if (pedidosResult.error) {
    console.error('predictive stock pedidos history read error:', pedidosResult.error);
    return [];
  }

  const demandMap = new Map<string, number>();

  const pedidosHistoricos =
    (pedidosResult.data ?? []) as unknown as PedidoStockHistoryRow[];

  for (const pedido of pedidosHistoricos) {
    if (!isClosedStatus(pedido.estado)) continue;

    const restaurantId = String(pedido.restaurant_id ?? '').trim();
    if (!restaurantId) continue;

    const weekday = getWeekdayIndexAR(pedido.creado_en);

    const items = Array.isArray(pedido.items_pedido)
      ? pedido.items_pedido
      : [];

    for (const item of items) {
      const productoId = getHistoryItemProductoId(item);
      const cantidad = getItemCantidad(item);

      if (productoId <= 0 || cantidad <= 0) continue;

      const key = getDemandKey({
        restaurantId,
        productoId,
        weekday,
      });

      demandMap.set(key, (demandMap.get(key) ?? 0) + cantidad);
    }
  }

  const stockRows =
    (stockResult.data ?? []) as unknown as ProductoStockPredictiveRow[];

  const alerts: PredictiveStockAlert[] = [];

  for (const stockRow of stockRows) {
    const restaurantId = String(stockRow.restaurant_id ?? '').trim();
    const producto = getProductoFromPredictiveStockRow(stockRow);
    const productoId = Number(stockRow.producto_id ?? producto?.id ?? 0);

    if (!restaurantId || productoId <= 0 || !producto) continue;

    if (stockRow.permitir_sin_stock === true) {
      continue;
    }

    if (producto.disponible === false || stockRow.visible_en_menu === false) {
      continue;
    }

    const stockActual = Math.max(Number(stockRow.stock_actual ?? 0), 0);

    for (let offset = 0; offset < PREDICTIVE_LOOKAHEAD_DAYS; offset += 1) {
      const targetDate = addDaysToLocalDate(today, offset);
      const weekday = getWeekdayIndexAR(`${targetDate}T12:00:00-03:00`);
      const occurrences = weekdayOccurrences.get(weekday) ?? 0;

      if (occurrences <= 0) continue;

      const key = getDemandKey({
        restaurantId,
        productoId,
        weekday,
      });

      const historicalUnits = demandMap.get(key) ?? 0;
      const demandaEsperada = Math.ceil(historicalUnits / occurrences);

      if (demandaEsperada <= 0) continue;

      const level = getPredictionLevel({
        stockActual,
        demandaEsperada,
      });

      if (!level) continue;

      const faltanteEstimado = Math.max(demandaEsperada - stockActual, 0);
      const diaObjetivo = WEEKDAY_LABELS[weekday] ?? 'día próximo';
      const restaurantLabel =
        labelMap.get(restaurantId) ?? `Sucursal ${restaurantId}`;

      alerts.push({
        restaurant_id: restaurantId,
        restaurant_label: restaurantLabel,
        producto_id: productoId,
        producto_nombre: producto.nombre ?? `Producto ${productoId}`,
        categoria: producto.categoria ?? null,
        stock_actual: stockActual,
        demanda_esperada: demandaEsperada,
        faltante_estimado: faltanteEstimado,
        fecha_objetivo: targetDate,
        dia_objetivo: diaObjetivo,
        dias_hasta_objetivo: offset,
        muestras_historicas: occurrences,
        nivel: level,
        lectura:
          level === 'critico'
            ? `Stock crítico: el stock actual no alcanza para cubrir la demanda histórica promedio del ${diaObjetivo}.`
            : `Stock en riesgo: el stock actual queda justo frente a la demanda histórica promedio del ${diaObjetivo}.`,
      });

      break;
    }
  }

  return alerts
    .sort((a, b) => {
      const levelOrder: Record<PredictiveStockLevel, number> = {
        critico: 0,
        riesgo: 1,
      };

      if (levelOrder[a.nivel] !== levelOrder[b.nivel]) {
        return levelOrder[a.nivel] - levelOrder[b.nivel];
      }

      if (a.dias_hasta_objetivo !== b.dias_hasta_objetivo) {
        return a.dias_hasta_objetivo - b.dias_hasta_objetivo;
      }

      if (b.faltante_estimado !== a.faltante_estimado) {
        return b.faltante_estimado - a.faltante_estimado;
      }

      return a.producto_nombre.localeCompare(b.producto_nombre);
    })
    .slice(0, 30);
}

function getDayHourBucketAR(value: string) {
  const date = new Date(value);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Mon';
  const hourText = parts.find((part) => part.type === 'hour')?.value ?? '0';

  return {
    dia: WEEKDAY_TO_INDEX[weekday] ?? 0,
    hora: Number(hourText),
  };
}

function buildHeatmapDiaHora(lista: PedidoAnalyticsRow[]): RowHeatmapDiaHora[] {
  const map = new Map<string, RowHeatmapDiaHora>();

  for (const day of HEATMAP_DAYS) {
    for (let hora = 0; hora < 24; hora += 1) {
      const key = `${day.dia}-${hora}`;

      map.set(key, {
        dia: day.dia,
        dia_label: day.label,
        hora,
        pedidos: 0,
        cerrados: 0,
        ingresos: 0,
      });
    }
  }

  for (const pedido of lista) {
    const bucket = getDayHourBucketAR(pedido.creado_en);
    const key = `${bucket.dia}-${bucket.hora}`;
    const row = map.get(key);

    if (!row) continue;

    row.pedidos += 1;

    if (isClosedStatus(pedido.estado)) {
      row.cerrados += 1;
      row.ingresos = safeRound(row.ingresos + getIngresosPedido(pedido));
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.dia !== b.dia) return a.dia - b.dia;
    return a.hora - b.hora;
  });
}

function buildPedidosQuery(isoDesde: string, isoHasta: string) {
  return supabaseAdmin
    .from('pedidos')
    .select(
  `
  id,
  estado,
  creado_en,
  mesa_id,
  tipo_servicio,
  origen,
  total,
  items_pedido (
        cantidad,
        producto:productos (
          id,
          nombre,
          precio,
          marca_id
        )
      )
    `
    )
    .gte('creado_en', isoDesde)
    .lte('creado_en', isoHasta);
}

function normalizeId(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

async function getRestaurantIdsForTenant(
  tenantId: string | null,
  accessRestaurantId: string | null
): Promise<string[]> {
  const ids = new Set<string>();

  if (accessRestaurantId) {
    ids.add(accessRestaurantId);
  }

  if (!tenantId) {
    return Array.from(ids);
  }

  const [byOwner, bySlug] = await Promise.all([
    supabaseAdmin
      .from('restaurants')
      .select('id, slug, owner_tenant_id')
      .eq('owner_tenant_id', tenantId),

    supabaseAdmin
      .from('restaurants')
      .select('id, slug, owner_tenant_id')
      .eq('slug', tenantId),
  ]);

  if (byOwner.error) {
    console.error(
      'analytics restaurants by owner_tenant_id error:',
      byOwner.error
    );
  }

  if (bySlug.error) {
    console.error('analytics restaurants by slug error:', bySlug.error);
  }

  const rows = [
    ...((byOwner.data ?? []) as RestaurantScopeRow[]),
    ...((bySlug.data ?? []) as RestaurantScopeRow[]),
  ];

  for (const row of rows) {
    const id = normalizeId(row.id);
    if (id) ids.add(id);
  }

  return Array.from(ids);
}

async function getRestaurantOptionsForTenant(
  tenantId: string | null,
  accessRestaurantId: string | null
): Promise<RestaurantOption[]> {
  const rowsById = new Map<string, RestaurantScopeRow>();

  if (accessRestaurantId) {
    const result = await supabaseAdmin
      .from('restaurants')
      .select('id, slug, owner_tenant_id')
      .eq('id', accessRestaurantId)
      .maybeSingle();

    if (!result.error && result.data) {
      const row = result.data as RestaurantScopeRow;
      const id = normalizeId(row.id);

      if (id) {
        rowsById.set(id, row);
      }
    }
  }

  if (tenantId) {
    const [byOwner, bySlug] = await Promise.all([
      supabaseAdmin
        .from('restaurants')
        .select('id, slug, owner_tenant_id')
        .eq('owner_tenant_id', tenantId),

      supabaseAdmin
        .from('restaurants')
        .select('id, slug, owner_tenant_id')
        .eq('slug', tenantId),
    ]);

    if (byOwner.error) {
      console.error(
        'analytics restaurant options by owner_tenant_id error:',
        byOwner.error
      );
    }

    if (bySlug.error) {
      console.error(
        'analytics restaurant options by slug error:',
        bySlug.error
      );
    }

    const rows = [
      ...((byOwner.data ?? []) as RestaurantScopeRow[]),
      ...((bySlug.data ?? []) as RestaurantScopeRow[]),
    ];

    for (const row of rows) {
      const id = normalizeId(row.id);

      if (id) {
        rowsById.set(id, row);
      }
    }
  }

  return Array.from(rowsById.values())
    .map((row) => {
      const id = normalizeId(row.id) ?? '';
      const slug = normalizeNonEmptyString(row.slug) ?? `sucursal-${id}`;

      return {
        id,
        slug,
        label: `${id} · ${slug}`,
        owner_tenant_id: normalizeNonEmptyString(row.owner_tenant_id),
      };
    })
    .filter((row) => row.id.length > 0)
    .sort((a, b) => Number(a.id) - Number(b.id));
}

async function resolveAnalyticsRestaurantScope(params: {
  requestedRestaurantId: string | null;
  accessRestaurantId: string | null;
  tenantId: string | null;
}): Promise<AnalyticsRestaurantScope> {
  if (params.requestedRestaurantId) {
    return {
      restaurantIds: [params.requestedRestaurantId],
      scopeUsed: 'restaurant_id_explicit',
    };
  }

  const tenantRestaurantIds = await getRestaurantIdsForTenant(
    params.tenantId,
    params.accessRestaurantId
  );

  if (tenantRestaurantIds.length > 0) {
    return {
      restaurantIds: tenantRestaurantIds,
      scopeUsed: 'tenant_restaurants',
    };
  }

  return {
    restaurantIds: [],
    scopeUsed: 'empty_scope',
  };
}

async function loadPedidosRango(
  isoDesde: string,
  isoHasta: string,
  restaurantIds: string[],
  scopeUsed: string
) {
  if (restaurantIds.length > 0) {
    const byRestaurants = await buildPedidosQuery(isoDesde, isoHasta).in(
      'restaurant_id',
      restaurantIds
    );

    if (!byRestaurants.error) {
      return {
        data: byRestaurants.data ?? [],
        scopeUsed,
      };
    }

    console.error(
      'analytics pedidos by restaurant_ids error:',
      byRestaurants.error
    );
  }

  if (process.env.NODE_ENV !== 'production') {
    const unscoped = await buildPedidosQuery(isoDesde, isoHasta);

    if (unscoped.error) {
      throw unscoped.error;
    }

    return {
      data: unscoped.data ?? [],
      scopeUsed: 'unscoped_dev_only',
    };
  }

  throw new Error(
    'No se pudo consultar pedidos con el contexto del restaurante.'
  );
}

async function loadMarcasByIds(marcaIds: string[]) {
  const uniqueIds = Array.from(new Set(marcaIds.filter(Boolean)));

  if (uniqueIds.length === 0) {
    return new Map<string, MarcaRow>();
  }

  const { data, error } = await supabaseAdmin
    .from('marcas')
    .select('id, nombre, color_hex, logo_url')
    .in('id', uniqueIds);

  if (error) {
    console.error('analytics marcas read error:', error);
    return new Map<string, MarcaRow>();
  }

  return new Map(
    ((data ?? []) as MarcaRow[]).map((marca) => [String(marca.id), marca])
  );
}

function collectMarcaIdsFromPedidos(lista: PedidoAnalyticsRow[]) {
  const ids = new Set<string>();

  for (const pedido of lista) {
    const items: unknown[] = Array.isArray(pedido.items_pedido)
      ? pedido.items_pedido
      : [];

    for (const item of items) {
      const marcaId = getProductoMarcaId(item);
      if (marcaId) ids.add(marcaId);
    }
  }

  return Array.from(ids);
}

function buildVentasPorMarca(
  lista: PedidoAnalyticsRow[],
  marcasMap: Map<string, MarcaRow>
): RowMarca[] {
  const SIN_MARCA_KEY = '__sin_marca__';

  const map = new Map<
    string,
    {
      marca_id: string | null;
      marca_nombre: string;
      color_hex: string | null;
      logo_url: string | null;
      pedidoIds: Set<number>;
      unidades: number;
      ingresos: number;
    }
  >();

  for (const pedido of lista) {
    if (!isClosedStatus(pedido.estado)) continue;

    const items: unknown[] = Array.isArray(pedido.items_pedido)
      ? pedido.items_pedido
      : [];

    for (const item of items) {
      const marcaId = getProductoMarcaId(item);
      const marca = marcaId ? marcasMap.get(marcaId) : null;
      const key = marcaId ?? SIN_MARCA_KEY;

      const cantidad = getItemCantidad(item);
      const precio = getProductoPrecio(item);
      const ingresosItem = cantidad * precio;

      const prev =
        map.get(key) ??
        {
          marca_id: marcaId,
          marca_nombre: marca?.nombre ?? 'Sin marca',
          color_hex: marca?.color_hex ?? null,
          logo_url: marca?.logo_url ?? null,
          pedidoIds: new Set<number>(),
          unidades: 0,
          ingresos: 0,
        };

      prev.pedidoIds.add(Number(pedido.id));
      prev.unidades += cantidad;
      prev.ingresos = safeRound(prev.ingresos + ingresosItem);

      map.set(key, prev);
    }
  }

  return Array.from(map.values())
    .map((row) => ({
      marca_id: row.marca_id,
      marca_nombre: row.marca_nombre,
      color_hex: row.color_hex,
      logo_url: row.logo_url,
      pedidos: row.pedidoIds.size,
      unidades: row.unidades,
      ingresos: row.ingresos,
    }))
    .sort((a, b) => {
      if (b.ingresos !== a.ingresos) return b.ingresos - a.ingresos;
      if (b.unidades !== a.unidades) return b.unidades - a.unidades;
      return a.marca_nombre.localeCompare(b.marca_nombre);
    });
}

async function loadTiemposRango(
  isoDesde: string,
  isoHasta: string,
  pedidoIds: number[]
) {
  if (pedidoIds.length === 0) {
    return [];
  }

  const tiemposResult = await supabaseAdmin
    .from('vw_tiempos_pedido')
    .select(
      `
      pedido_id,
      mesa_id,
      creado_en,
      estado_actual,
      min_mozo_confirma,
      min_espera_cocina,
      min_preparacion,
      min_total_hasta_listo
    `
    )
    .gte('creado_en', isoDesde)
    .lte('creado_en', isoHasta)
    .in('pedido_id', pedidoIds)
    .order('creado_en', { ascending: false });

  if (tiemposResult.error) {
    console.error('analytics tiempos by pedido_id error:', tiemposResult.error);
    return [];
  }

  return tiemposResult.data ?? [];
}

const STOCK_BAJO_THRESHOLD = 5;

function getProductoFromStockRow(row: ProductoStockRow) {
  if (Array.isArray(row.productos)) {
    return row.productos[0] ?? null;
  }

  return row.productos ?? null;
}

function getStockEstado(params: {
  control_stock: boolean;
  stock_actual: number;
  permitir_sin_stock: boolean;
}): StockEstado {
  if (!params.control_stock) return 'sin_control';
  if (params.permitir_sin_stock) return 'flexible';
  if (params.stock_actual <= 0) return 'agotado';
  if (params.stock_actual <= STOCK_BAJO_THRESHOLD) return 'bajo';
  return 'ok';
}

function buildRestaurantLabelMap(restaurants: RestaurantOption[]) {
  return new Map(
    restaurants.map((restaurant) => [
      String(restaurant.id),
      restaurant.label || restaurant.slug || `Sucursal ${restaurant.id}`,
    ])
  );
}

async function loadStockControlReport(params: {
  restaurantIds: string[];
  restaurantOptions: RestaurantOption[];
}): Promise<StockControlReport> {
  const empty: StockControlReport = {
    resumen: {
      total_productos: 0,
      controlados: 0,
      agotados: 0,
      bajos: 0,
      flexibles: 0,
      sin_control: 0,
      ok: 0,
    },
    sucursales: [],
    criticos: [],
  };

  if (params.restaurantIds.length === 0) {
    return empty;
  }

  const labelMap = buildRestaurantLabelMap(params.restaurantOptions);

  const { data, error } = await supabaseAdmin
    .from('producto_restaurantes')
    .select(
      `
      restaurant_id,
      producto_id,
      visible_en_menu,
      control_stock,
      stock_actual,
      permitir_sin_stock,
      productos (
        id,
        nombre,
        categoria,
        precio,
        disponible
      )
    `
    )
    .in('restaurant_id', params.restaurantIds)
    .order('restaurant_id', { ascending: true })
    .order('producto_id', { ascending: true });

  if (error) {
    console.error('analytics stock control read error:', error);
    return empty;
  }

  const rows = ((data ?? []) as unknown as ProductoStockRow[])
    .map((row): StockProductoReport | null => {
      const producto = getProductoFromStockRow(row);
      const restaurantId = String(row.restaurant_id ?? '').trim();
      const productoId = Number(row.producto_id ?? producto?.id ?? 0);

      if (!restaurantId || !productoId || !producto) {
        return null;
      }

      const controlStock = row.control_stock === true;
      const permitirSinStock = row.permitir_sin_stock === true;
      const stockActual = Math.max(Number(row.stock_actual ?? 0), 0);
      const estado = getStockEstado({
        control_stock: controlStock,
        stock_actual: stockActual,
        permitir_sin_stock: permitirSinStock,
      });

      return {
        restaurant_id: restaurantId,
        restaurant_label: labelMap.get(restaurantId) ?? `Sucursal ${restaurantId}`,
        producto_id: productoId,
        producto_nombre: producto.nombre ?? `Producto ${productoId}`,
        categoria: producto.categoria ?? null,
        visible_en_menu: row.visible_en_menu === true,
        disponible: producto.disponible !== false,
        control_stock: controlStock,
        stock_actual: stockActual,
        permitir_sin_stock: permitirSinStock,
        estado,
      };
    })
    .filter((row): row is StockProductoReport => row !== null);

  const sucursalesMap = new Map<string, StockSucursalReport>();

  for (const restaurantId of params.restaurantIds) {
    const id = String(restaurantId);
    sucursalesMap.set(id, {
      restaurant_id: id,
      restaurant_label: labelMap.get(id) ?? `Sucursal ${id}`,
      total_productos: 0,
      controlados: 0,
      agotados: 0,
      bajos: 0,
      flexibles: 0,
      sin_control: 0,
      ok: 0,
      productos: [],
    });
  }

  for (const row of rows) {
    const sucursal =
      sucursalesMap.get(row.restaurant_id) ??
      ({
        restaurant_id: row.restaurant_id,
        restaurant_label: row.restaurant_label,
        total_productos: 0,
        controlados: 0,
        agotados: 0,
        bajos: 0,
        flexibles: 0,
        sin_control: 0,
        ok: 0,
        productos: [],
      } satisfies StockSucursalReport);

    sucursal.total_productos += 1;
    sucursal.productos.push(row);

    if (row.control_stock) sucursal.controlados += 1;

    if (row.estado === 'agotado') sucursal.agotados += 1;
    if (row.estado === 'bajo') sucursal.bajos += 1;
    if (row.estado === 'flexible') sucursal.flexibles += 1;
    if (row.estado === 'sin_control') sucursal.sin_control += 1;
    if (row.estado === 'ok') sucursal.ok += 1;

    sucursalesMap.set(row.restaurant_id, sucursal);
  }

  const sucursales = Array.from(sucursalesMap.values()).map((sucursal) => ({
    ...sucursal,
    productos: sucursal.productos.sort((a, b) => {
      const order: Record<StockEstado, number> = {
        agotado: 0,
        bajo: 1,
        flexible: 2,
        ok: 3,
        sin_control: 4,
      };

      if (order[a.estado] !== order[b.estado]) {
        return order[a.estado] - order[b.estado];
      }

      return a.producto_nombre.localeCompare(b.producto_nombre);
    }),
  }));

  const resumen = sucursales.reduce(
    (acc, sucursal) => {
      acc.total_productos += sucursal.total_productos;
      acc.controlados += sucursal.controlados;
      acc.agotados += sucursal.agotados;
      acc.bajos += sucursal.bajos;
      acc.flexibles += sucursal.flexibles;
      acc.sin_control += sucursal.sin_control;
      acc.ok += sucursal.ok;
      return acc;
    },
    {
      total_productos: 0,
      controlados: 0,
      agotados: 0,
      bajos: 0,
      flexibles: 0,
      sin_control: 0,
      ok: 0,
    }
  );

  const criticos = rows
    .filter((row) => row.estado === 'agotado' || row.estado === 'bajo')
    .sort((a, b) => {
      const estadoOrder: Record<StockEstado, number> = {
        agotado: 0,
        bajo: 1,
        flexible: 2,
        ok: 3,
        sin_control: 4,
      };

      if (estadoOrder[a.estado] !== estadoOrder[b.estado]) {
        return estadoOrder[a.estado] - estadoOrder[b.estado];
      }

      if (a.stock_actual !== b.stock_actual) {
        return a.stock_actual - b.stock_actual;
      }

      return a.producto_nombre.localeCompare(b.producto_nombre);
    })
    .slice(0, 30);

  return {
    resumen,
    sucursales,
    criticos,
  };
}

export async function GET(request: NextRequest) {
  const auth = requireAdminAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  const requestedContext = extractRequestedTenantContext(request, auth.session);

  let access = getFallbackAdminAccess();

  try {
    access = await resolveAdminAccess(requestedContext);
  } catch (error) {
    console.error('GET /api/admin/analytics access resolution error:', error);
  }

  const canAccessReports =
  access.plan === 'pro' || access.plan === 'intelligence';

if (!canAccessReports) {
  return NextResponse.json(
    {
      error: 'Reportes disponibles desde el plan Pro.',
    },
    { status: 403 }
  );
}

  const requestedRestaurantId = normalizeId(requestedContext.restaurantId);
const accessRestaurantId = normalizeId(access.restaurant?.id);
const tenantId = normalizeId(access.tenantId);

const analyticsScope = await resolveAnalyticsRestaurantScope({
  requestedRestaurantId,
  accessRestaurantId,
  tenantId,
});

const restaurantOptions = await getRestaurantOptionsForTenant(
  tenantId,
  accessRestaurantId
);

const predictiveStockAlerts =
  access.plan === 'intelligence'
    ? await loadPredictiveStockAlerts({
        restaurantIds: analyticsScope.restaurantIds,
        restaurantOptions,
      })
    : [];

const stockControl = await loadStockControlReport({
  restaurantIds: analyticsScope.restaurantIds,
  restaurantOptions,
});

if (analyticsScope.restaurantIds.length === 0) {
  return NextResponse.json(
    {
      error: 'No se pudo resolver ningún restaurante para cargar analytics.',
    },
    { status: 400 }
  );
}
  const defaults = getDefaultDateRange();
  const desdeParam = request.nextUrl.searchParams.get('desde');
  const hastaParam = request.nextUrl.searchParams.get('hasta');

  const canalFiltro = normalizeCanalFilter(
  request.nextUrl.searchParams.get('canal')
);

  const desde = isValidDateInput(desdeParam) ? desdeParam : defaults.desde;
  const hasta = isValidDateInput(hastaParam) ? hastaParam : defaults.hasta;

  if (desde > hasta) {
    return NextResponse.json(
      {
        error:
          'El rango es inválido: la fecha Desde no puede ser mayor que Hasta.',
      },
      { status: 400 }
    );
  }

  const isoDesde = toIsoStartOfDayAR(desde);
  const isoHasta = toIsoEndOfDayAR(hasta);

  if (request.nextUrl.searchParams.get('debug') === '1') {
  const scopedCountResult =
  analyticsScope.restaurantIds.length > 0
    ? await supabaseAdmin
        .from('pedidos')
        .select('id', { count: 'exact', head: true })
        .in('restaurant_id', analyticsScope.restaurantIds)
        .gte('creado_en', isoDesde)
        .lte('creado_en', isoHasta)
    : null;

  const unscopedCountResult = await supabaseAdmin
    .from('pedidos')
    .select('id', { count: 'exact', head: true })
    .gte('creado_en', isoDesde)
    .lte('creado_en', isoHasta);

  const latestPedidosResult = await supabaseAdmin
    .from('pedidos')
    .select(
      `
      id,
      creado_en,
      estado,
      mesa_id,
      restaurant_id,
      origen,
      tipo_servicio,
      total
    `
    )
    .order('creado_en', { ascending: false })
    .limit(15);

  return NextResponse.json(
    {
      ok: true,
      debug: {
  desde,
  hasta,
  isoDesde,
  isoHasta,
  requestedRestaurantId,
  accessRestaurantId,
  tenantId,
  analyticsRestaurantIds: analyticsScope.restaurantIds,
  analyticsScopeUsed: analyticsScope.scopeUsed,
  accessRestaurant: access.restaurant,
  accessTenantId: access.tenantId,
  scopedCount: scopedCountResult?.count ?? null,
  scopedError: scopedCountResult?.error?.message ?? null,
  unscopedCount: unscopedCountResult.count ?? null,
  unscopedError: unscopedCountResult.error?.message ?? null,
  latestPedidos: latestPedidosResult.data ?? [],
  latestPedidosError: latestPedidosResult.error?.message ?? null,
}
    },
    { status: 200 }
  );
}

  try {
    const pedidosResult = await loadPedidosRango(
  isoDesde,
  isoHasta,
  analyticsScope.restaurantIds,
  analyticsScope.scopeUsed
);

    const pedidosRango = pedidosResult.data;

    if (process.env.NODE_ENV !== 'production') {
  console.log('ANALYTICS DEBUG PEDIDOS', {
    requestedRestaurantId,
    accessRestaurantId,
    tenantId,
    analyticsRestaurantIds: analyticsScope.restaurantIds,
    desde,
    hasta,
    scopeUsed: pedidosResult.scopeUsed,
    pedidosCount: pedidosRango.length,
    firstPedido: pedidosRango[0] ?? null,
  });
}

    const listaBase = (pedidosRango ?? []) as unknown as PedidoAnalyticsRow[];

const lista =
  canalFiltro === 'todos'
    ? listaBase
    : listaBase.filter((pedido) => getPedidoCanal(pedido) === canalFiltro);

const pedidosTotal = lista.length;

    const pedidosCerrados = lista.filter((pedido) =>
      isClosedStatus(pedido.estado)
    ).length;

    const pedidosCancelados = lista.filter((pedido) =>
      isCancelledStatus(pedido.estado)
    ).length;

    const ingresos = safeRound(
  lista
    .filter((pedido) => isClosedStatus(pedido.estado))
    .reduce((accPedido: number, pedido) => {
      return accPedido + getIngresosPedido(pedido);
    }, 0)
);

    const ticketPromedio =
      pedidosCerrados > 0 ? safeRound(ingresos / pedidosCerrados) : null;

    const pedidosHoraMap = new Map<string, number>();

    for (const pedido of lista) {
      const bucket = getHourBucketIso(pedido.creado_en);
      pedidosHoraMap.set(bucket, (pedidosHoraMap.get(bucket) ?? 0) + 1);
    }

    const pedidosHora: RowPedidosHora[] = Array.from(pedidosHoraMap.entries())
      .map(([hora, pedidos]) => ({ hora, pedidos }))
      .sort((a, b) => a.hora.localeCompare(b.hora));

    const topProductosMap = new Map<
      string,
      {
        producto_id: number;
        producto_nombre: string;
        unidades: number;
        ingresos: number;
      }
    >();

    for (const pedido of lista) {
      if (!isClosedStatus(pedido.estado)) continue;

      const items: unknown[] = Array.isArray(pedido.items_pedido)
        ? pedido.items_pedido
        : [];

      for (const item of items) {
        const productoId = getProductoId(item);
        const productoNombre = getProductoNombre(item);
        const cantidad = getItemCantidad(item);
        const precio = getProductoPrecio(item);

        const key = `${productoId || 0}:${productoNombre}`;
        const prev = topProductosMap.get(key);

        topProductosMap.set(key, {
          producto_id: productoId,
          producto_nombre: productoNombre,
          unidades: (prev?.unidades ?? 0) + cantidad,
          ingresos: safeRound((prev?.ingresos ?? 0) + cantidad * precio),
        });
      }
    }

    const topProductos: RowTopProductos[] = Array.from(topProductosMap.values())
      .sort((a, b) => {
        if (b.unidades !== a.unidades) return b.unidades - a.unidades;
        return b.ingresos - a.ingresos;
      })
      .slice(0, 15);

    const marcaIds = collectMarcaIdsFromPedidos(lista);
    const marcasMap = await loadMarcasByIds(marcaIds);
    const ventasPorMarca = buildVentasPorMarca(lista, marcasMap);

    const canalesBase: Record<CanalCode, RowCanal> = {
      salon: { canal: 'salon', cantidad: 0, ingresos: 0 },
      takeaway: { canal: 'takeaway', cantidad: 0, ingresos: 0 },
      delivery: { canal: 'delivery', cantidad: 0, ingresos: 0 },
    };

    for (const pedido of lista) {
      const canal = getPedidoCanal(pedido);
      canalesBase[canal].cantidad += 1;

      if (isClosedStatus(pedido.estado)) {
  canalesBase[canal].ingresos = safeRound(
    canalesBase[canal].ingresos + getIngresosPedido(pedido)
  );
}
    }

    const canales: RowCanal[] = [
      canalesBase.salon,
      canalesBase.takeaway,
      canalesBase.delivery,
    ];

    const serieDiariaBase = new Map<string, RowSerieDiaria>();

    for (const fecha of buildDateRangeList(desde, hasta)) {
      serieDiariaBase.set(fecha, {
        fecha,
        pedidos: 0,
        cerrados: 0,
        cancelados: 0,
        ingresos: 0,
      });
    }

    for (const pedido of lista) {
      const fecha = getDayBucket(pedido.creado_en);
      const row = serieDiariaBase.get(fecha);

      if (!row) continue;

      row.pedidos += 1;

      if (isClosedStatus(pedido.estado)) {
        row.cerrados += 1;

        row.ingresos = safeRound(row.ingresos + getIngresosPedido(pedido));
      }

      if (isCancelledStatus(pedido.estado)) {
        row.cancelados += 1;
      }
    }

    const serieDiaria: RowSerieDiaria[] = Array.from(
  serieDiariaBase.values()
).sort((a, b) => a.fecha.localeCompare(b.fecha));

const heatmapDiaHora = buildHeatmapDiaHora(lista);

let tiempos: RowTiemposPedido[] = [];

    try {
      const tiemposData = await loadTiemposRango(
        isoDesde,
        isoHasta,
        pedidosRango.map((pedido) => Number(pedido.id)).filter((id) => id > 0)
      );

      tiempos = tiemposData as RowTiemposPedido[];
    } catch (error) {
      console.error('GET /api/admin/analytics tiempos unexpected warning:', error);
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
  range: {
    desde,
    hasta,
    isoDesde,
    isoHasta,
    canal: canalFiltro,
    restaurantId: requestedRestaurantId,
    restaurantIds: analyticsScope.restaurantIds,
    scopeUsed: analyticsScope.scopeUsed,
  },
  restaurants: restaurantOptions,
  stockControl,
  predictiveStockAlerts,
  kpis: {
            pedidosTotal,
            pedidosCerrados,
            pedidosCancelados,
            ingresos,
            ticketPromedio,
          },
          pedidosHora,
topProductos,
ventasPorMarca,
canales,
serieDiaria,
heatmapDiaHora,
tiempos,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET /api/admin/analytics error:', error);

    return NextResponse.json(
      { error: 'No se pudieron cargar los analytics.' },
      { status: 500 }
    );
  }
}