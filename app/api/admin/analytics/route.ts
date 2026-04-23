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

type RowSerieDiaria = {
  fecha: string;
  pedidos: number;
  cerrados: number;
  cancelados: number;
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
  items_pedido: unknown[] | null;
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

function getProductoPrecio(item: unknown): number {
  const producto = getProductoRaw(item);

  if (Array.isArray(producto)) {
    return Number(
      (producto[0] as { precio?: number | null } | undefined)?.precio ?? 0
    );
  }

  if (producto && typeof producto === 'object') {
    return Number((producto as { precio?: number | null }).precio ?? 0);
  }

  return 0;
}

function getProductoNombre(item: unknown): string {
  const producto = getProductoRaw(item);

  if (Array.isArray(producto)) {
    return String(
      (producto[0] as { nombre?: string | null } | undefined)?.nombre ??
        'Producto'
    );
  }

  if (producto && typeof producto === 'object') {
    return String((producto as { nombre?: string | null }).nombre ?? 'Producto');
  }

  return 'Producto';
}

function getProductoId(item: unknown): number {
  const producto = getProductoRaw(item);

  if (Array.isArray(producto)) {
    return Number(
      (producto[0] as { id?: number | null } | undefined)?.id ?? 0
    );
  }

  if (producto && typeof producto === 'object') {
    return Number((producto as { id?: number | null }).id ?? 0);
  }

  return 0;
}

function getPedidoCanal(pedido: Pick<PedidoAnalyticsRow, 'mesa_id' | 'tipo_servicio' | 'origen'>): CanalCode {
  const tipoServicio = normalizeText(pedido.tipo_servicio);
  const origen = normalizeText(pedido.origen);

  const isDelivery =
    pedido.mesa_id === 0 ||
    tipoServicio === 'delivery' ||
    tipoServicio === 'envio' ||
    origen.includes('delivery') ||
    origen.includes('envio');

  if (isDelivery) {
    return 'delivery';
  }

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
      items_pedido (
        cantidad,
        producto:productos ( id, nombre, precio )
      )
    `
    )
    .gte('creado_en', isoDesde)
    .lte('creado_en', isoHasta);
}

async function loadPedidosRango(
  isoDesde: string,
  isoHasta: string,
  restaurantId: string | null,
  tenantId: string | null
) {
  if (restaurantId) {
    const byRestaurant = await buildPedidosQuery(isoDesde, isoHasta).eq(
      'restaurant_id',
      restaurantId
    );

    if (!byRestaurant.error && (byRestaurant.data?.length ?? 0) > 0) {
      return {
        data: byRestaurant.data ?? [],
        scopeUsed: 'restaurant_id',
      };
    }

    if (byRestaurant.error) {
      console.error(
        'analytics pedidos by restaurant_id error:',
        byRestaurant.error
      );
    }
  }

  if (tenantId) {
    const byTenant = await buildPedidosQuery(isoDesde, isoHasta).eq(
      'tenant_id',
      tenantId
    );

    if (!byTenant.error && (byTenant.data?.length ?? 0) > 0) {
      return {
        data: byTenant.data ?? [],
        scopeUsed: 'tenant_id',
      };
    }

    if (byTenant.error) {
      console.error('analytics pedidos by tenant_id error:', byTenant.error);
    }
  }

  const unscoped = await buildPedidosQuery(isoDesde, isoHasta);

  if (unscoped.error) {
    throw unscoped.error;
  }

  return {
    data: unscoped.data ?? [],
    scopeUsed: 'unscoped',
  };
}

function buildTiemposQuery(isoDesde: string, isoHasta: string) {
  return supabaseAdmin
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
    .order('creado_en', { ascending: false });
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

  if (!canAccessAnalytics(access.plan)) {
    return NextResponse.json(
      {
        error: 'Analytics avanzados disponibles solo en el plan Intelligence.',
      },
      { status: 403 }
    );
  }

  const restaurantId = access.restaurant?.id ?? requestedContext.restaurantId ?? null;
  const tenantId = access.tenantId ?? requestedContext.tenantSlug ?? null;

  if (!restaurantId && !tenantId) {
    return NextResponse.json(
      {
        error:
          'No se pudo resolver el contexto del restaurante para cargar analytics.',
      },
      { status: 400 }
    );
  }

  const defaults = getDefaultDateRange();
  const desdeParam = request.nextUrl.searchParams.get('desde');
  const hastaParam = request.nextUrl.searchParams.get('hasta');

  const desde = isValidDateInput(desdeParam) ? desdeParam : defaults.desde;
  const hasta = isValidDateInput(hastaParam) ? hastaParam : defaults.hasta;

  if (desde > hasta) {
    return NextResponse.json(
      {
        error: 'El rango es inválido: la fecha Desde no puede ser mayor que Hasta.',
      },
      { status: 400 }
    );
  }

  const isoDesde = toIsoStartOfDayAR(desde);
  const isoHasta = toIsoEndOfDayAR(hasta);

  try {
    const pedidosResult = await loadPedidosRango(
  isoDesde,
  isoHasta,
  restaurantId,
  tenantId
);

const pedidosRango = pedidosResult.data;

console.log('ANALYTICS DEBUG PEDIDOS', {
  restaurantId,
  tenantId,
  desde,
  hasta,
  scopeUsed: pedidosResult.scopeUsed,
  pedidosCount: pedidosRango.length,
  firstPedido: pedidosRango[0] ?? null,
});

    const lista = (pedidosRango ?? []) as unknown as PedidoAnalyticsRow[];

    const pedidosTotal = lista.length;

    const pedidosCerrados = lista.filter((pedido) =>
      isClosedStatus(pedido.estado)
    ).length;

    const pedidosCancelados = lista.filter((pedido) =>
      isCancelledStatus(pedido.estado)
    ).length;

    const ingresos = lista
      .filter((pedido) => isClosedStatus(pedido.estado))
      .reduce((accPedido: number, pedido) => {
        const items: unknown[] = Array.isArray(pedido.items_pedido)
          ? pedido.items_pedido
          : [];

        const subtotalPedido: number = items.reduce(
          (accItem: number, item: unknown) => {
            const cantidad = getItemCantidad(item);
            const precio = getProductoPrecio(item);
            return accItem + cantidad * precio;
          },
          0
        );

        return accPedido + subtotalPedido;
      }, 0);

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

    const canalesBase: Record<CanalCode, RowCanal> = {
      salon: { canal: 'salon', cantidad: 0, ingresos: 0 },
      takeaway: { canal: 'takeaway', cantidad: 0, ingresos: 0 },
      delivery: { canal: 'delivery', cantidad: 0, ingresos: 0 },
    };

    for (const pedido of lista) {
      const canal = getPedidoCanal(pedido);
      canalesBase[canal].cantidad += 1;

      if (isClosedStatus(pedido.estado)) {
        const items: unknown[] = Array.isArray(pedido.items_pedido)
          ? pedido.items_pedido
          : [];

        const subtotalPedido = items.reduce((accItem: number, item: unknown) => {
          return accItem + getItemCantidad(item) * getProductoPrecio(item);
        }, 0);

        canalesBase[canal].ingresos = safeRound(
          canalesBase[canal].ingresos + subtotalPedido
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

        const items: unknown[] = Array.isArray(pedido.items_pedido)
          ? pedido.items_pedido
          : [];

        const subtotalPedido = items.reduce((accItem: number, item: unknown) => {
          return accItem + getItemCantidad(item) * getProductoPrecio(item);
        }, 0);

        row.ingresos = safeRound(row.ingresos + subtotalPedido);
      }

      if (isCancelledStatus(pedido.estado)) {
        row.cancelados += 1;
      }
    }

    const serieDiaria: RowSerieDiaria[] = Array.from(serieDiariaBase.values()).sort(
      (a, b) => a.fecha.localeCompare(b.fecha)
    );

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
    debug: {
      restaurantId,
      tenantId,
      scopeUsed: pedidosResult.scopeUsed,
      pedidosCount: pedidosRango.length,
      firstPedido: pedidosRango[0] ?? null,
    },
    data: {
          range: {
            desde,
            hasta,
            isoDesde,
            isoHasta,
          },
          kpis: {
            pedidosTotal,
            pedidosCerrados,
            pedidosCancelados,
            ingresos,
            ticketPromedio,
          },
        pedidosHora,
          topProductos,
          canales,
          serieDiaria,
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