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

type MarcaRow = {
  id: string;
  nombre: string;
  color_hex: string | null;
  logo_url: string | null;
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

function getPedidoCanal(
  pedido: Pick<PedidoAnalyticsRow, 'mesa_id' | 'tipo_servicio' | 'origen'>
): CanalCode {
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

    if (!byRestaurant.error) {
      return {
        data: byRestaurant.data ?? [],
        scopeUsed: 'restaurant_id',
      };
    }

    console.error(
      'analytics pedidos by restaurant_id error:',
      byRestaurant.error
    );
  }

  if (tenantId) {
    const byTenant = await buildPedidosQuery(isoDesde, isoHasta).eq(
      'tenant_id',
      tenantId
    );

    if (!byTenant.error) {
      return {
        data: byTenant.data ?? [],
        scopeUsed: 'tenant_id',
      };
    }

    console.error('analytics pedidos by tenant_id error:', byTenant.error);
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

  const restaurantId =
  access.restaurant?.id ?? requestedContext.restaurantId ?? null;
const tenantId = access.tenantId ?? null;

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
        error:
          'El rango es inválido: la fecha Desde no puede ser mayor que Hasta.',
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

    const serieDiaria: RowSerieDiaria[] = Array.from(
      serieDiariaBase.values()
    ).sort((a, b) => a.fecha.localeCompare(b.fecha));

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
          ventasPorMarca,
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