import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRestaurantContext } from '@/lib/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PedidoRow = {
  id: number;
  codigo_publico?: string | null;
  creado_en: string;
  estado: string;
  origen?: string | null;
  tipo_servicio?: string | null;
  cliente_nombre?: string | null;
};

type LocalConfigRow = {
  nombre_local?: string | null;
  business_mode?: string | null;
};

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function isTakeawayPedido(pedido: PedidoRow) {
  const tipoServicio = normalizeText(pedido.tipo_servicio);
  const origen = normalizeText(pedido.origen);

  return (
    tipoServicio === 'takeaway' ||
    tipoServicio === 'take_away' ||
    tipoServicio === 'pickup' ||
    tipoServicio === 'pick_up' ||
    tipoServicio === 'retiro' ||
    origen === 'takeaway' ||
    origen === 'takeaway_web' ||
    origen === 'takeaway_manual' ||
    origen === 'takeaway_manual_mostrador' ||
    origen === 'pickup' ||
    origen === 'retiro'
  );
}

function getDisplayCode(pedido: PedidoRow) {
  return pedido.codigo_publico?.trim() || `Pedido #${pedido.id}`;
}

function getDisplayName(pedido: PedidoRow) {
  const nombre = String(pedido.cliente_nombre ?? '').trim();
  return nombre || 'Cliente sin nombre';
}

function normalizeBusinessMode(value: unknown): 'restaurant' | 'takeaway' {
  return normalizeText(value) === 'takeaway' ? 'takeaway' : 'restaurant';
}

export async function GET() {
  try {
    const restaurant = await getRestaurantContext().catch(() => null);

    let configQuery = supabaseAdmin
      .from('configuracion_local')
      .select('nombre_local, business_mode')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (restaurant?.id != null) {
      configQuery = supabaseAdmin
        .from('configuracion_local')
        .select('nombre_local, business_mode')
        .eq('restaurant_id', restaurant.id)
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();
    }

    let pedidosQuery = supabaseAdmin
      .from('pedidos')
      .select(
        `
          id,
          codigo_publico,
          creado_en,
          estado,
          origen,
          tipo_servicio,
          cliente_nombre
        `
      )
      .in('estado', ['pendiente', 'en_preparacion', 'listo'])
      .order('creado_en', { ascending: false })
      .limit(60);

    if (restaurant?.id != null) {
      pedidosQuery = pedidosQuery.eq('restaurant_id', restaurant.id);
    }

    const [configResult, pedidosResult] = await Promise.all([
      configQuery,
      pedidosQuery,
    ]);

    if (configResult.error) {
      return NextResponse.json(
        {
          error: `No se pudo cargar la configuración pública: ${configResult.error.message}`,
        },
        { status: 500 }
      );
    }

    if (pedidosResult.error) {
      return NextResponse.json(
        {
          error: `No se pudieron cargar los pedidos públicos: ${pedidosResult.error.message}`,
        },
        { status: 500 }
      );
    }

    const config = (configResult.data ?? null) as LocalConfigRow | null;
    const businessMode = normalizeBusinessMode(config?.business_mode);

    const pedidos = ((pedidosResult.data ?? []) as PedidoRow[]).filter(
      isTakeawayPedido
    );

    const readyOrders = pedidos
      .filter((pedido) => normalizeText(pedido.estado) === 'listo')
      .slice(0, 12)
      .map((pedido) => ({
        id: pedido.id,
        codigo: getDisplayCode(pedido),
        cliente_nombre: getDisplayName(pedido),
        creado_en: pedido.creado_en,
        estado: pedido.estado,
      }));

    const preparingOrders = pedidos
      .filter((pedido) => {
        const estado = normalizeText(pedido.estado);
        return estado === 'pendiente' || estado === 'en_preparacion';
      })
      .slice(0, 20)
      .map((pedido) => ({
        id: pedido.id,
        codigo: getDisplayCode(pedido),
        cliente_nombre: getDisplayName(pedido),
        creado_en: pedido.creado_en,
        estado: pedido.estado,
      }));

    return NextResponse.json(
      {
        local: {
          nombre:
            config?.nombre_local?.trim() ||
            restaurant?.slug ||
            'RestoSmart',
          slug: restaurant?.slug ?? null,
          business_mode: businessMode,
        },
        readyOrders,
        preparingOrders,
        generatedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET /api/public/retiro', error);

    return NextResponse.json(
      {
        error:
          'Ocurrió un error inesperado al cargar la pantalla pública de retiro.',
      },
      { status: 500 }
    );
  }
}