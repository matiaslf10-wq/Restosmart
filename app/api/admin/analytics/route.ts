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

type RowPedidosHora = { hora: string; pedidos: number };

type RowTopProductos = {
  producto_id: number;
  producto_nombre: string;
  unidades: number;
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

function getItemCantidad(item: unknown): number {
  if (!item || typeof item !== 'object') return 0;
  return Number((item as { cantidad?: unknown }).cantidad ?? 0);
}

function getProductoPrecio(item: unknown): number {
  if (!item || typeof item !== 'object') return 0;

  const producto = (item as { producto?: unknown }).producto;

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
    const { data: pedidosRango, error: errPedidosRango } = await supabaseAdmin
      .from('pedidos')
      .select(
        `
        id,
        estado,
        creado_en,
        items_pedido (
          cantidad,
          producto:productos ( precio )
        )
      `
      )
      .gte('creado_en', isoDesde)
      .lte('creado_en', isoHasta);

    if (errPedidosRango) throw errPedidosRango;

    const lista = (pedidosRango ?? []) as unknown as PedidoAnalyticsRow[];

    const pedidosTotal = lista.length;

    const pedidosCerrados = lista.filter((pedido) =>
      CLOSED_STATUSES.has(String(pedido.estado ?? '').toLowerCase())
    ).length;

    const pedidosCancelados = lista.filter((pedido) =>
      CANCELLED_STATUSES.has(String(pedido.estado ?? '').toLowerCase())
    ).length;

    const ingresos = lista
      .filter((pedido) =>
        CLOSED_STATUSES.has(String(pedido.estado ?? '').toLowerCase())
      )
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

    const { data: pedidosHora, error: errPedidosHora } = await supabaseAdmin
      .from('vw_pedidos_por_hora')
      .select('*')
      .gte('hora', isoDesde)
      .lte('hora', isoHasta)
      .order('hora', { ascending: true });

    if (errPedidosHora) throw errPedidosHora;

    const { data: topProductos, error: errTopProductos } =
      await supabaseAdmin.rpc('fn_top_productos_rango', {
        p_desde: isoDesde,
        p_hasta: isoHasta,
        p_limit: 15,
      });

    if (errTopProductos) throw errTopProductos;

    const { data: tiempos, error: errTiempos } = await supabaseAdmin
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

    if (errTiempos) throw errTiempos;

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
          pedidosHora: (pedidosHora ?? []) as RowPedidosHora[],
          topProductos: (topProductos ?? []) as RowTopProductos[],
          tiempos: (tiempos ?? []) as RowTiemposPedido[],
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