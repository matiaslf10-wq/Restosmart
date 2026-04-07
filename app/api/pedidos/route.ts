import { NextRequest, NextResponse } from 'next/server';
import { getRestaurantContext } from '@/lib/tenant';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

type RestaurantContext = {
  id: string | number;
  slug: string;
  plan?: string | null;
};

type PedidoItemInput = {
  producto_id: number;
  cantidad: number;
  comentarios?: string | null;
};

type CreatePedidoBody = {
  mesa_id: number;
  total: number;
  forma_pago: 'virtual' | 'efectivo';
  origen?: string | null;
  tipo_servicio?: string | null;
  medio_pago?: string | null;
  estado_pago?: string | null;
  efectivo_aprobado?: boolean | null;
  paga_efectivo?: boolean | null;
  items: PedidoItemInput[];
};

function normalizePlan(plan: unknown): 'esencial' | 'pro' | 'intelligence' {
  const value = String(plan ?? '').trim().toLowerCase();

  if (value === 'pro') return 'pro';
  if (value === 'intelligence') return 'intelligence';
  return 'esencial';
}

function getInitialPedidoEstado(params: {
  plan: 'esencial' | 'pro' | 'intelligence';
  origen?: string | null;
  tipo_servicio?: string | null;
}) {
  const origen = params.origen ?? 'salon';
  const tipoServicio = params.tipo_servicio ?? 'mesa';

  const esSalonMesa = origen === 'salon' && tipoServicio === 'mesa';

  if (!esSalonMesa) {
    return 'pendiente';
  }

  if (params.plan === 'esencial') {
    return 'pendiente';
  }

  return 'solicitado';
}

async function resolveRestaurantContext(sb: ReturnType<typeof supabaseAdmin>) {
  const ctx = await getRestaurantContext().catch(() => null);

  if (ctx?.id) {
    return ctx as RestaurantContext;
  }

  const defaultTenantId = process.env.DEFAULT_TENANT_ID?.trim();

  if (defaultTenantId) {
    const bySlug = await sb
      .from('restaurants')
      .select('id, slug, plan')
      .eq('slug', defaultTenantId)
      .maybeSingle();

    if (!bySlug.error && bySlug.data?.id) {
      return bySlug.data as RestaurantContext;
    }
  }

  const fallback = await sb
    .from('restaurants')
    .select('id, slug, plan')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!fallback.error && fallback.data?.id) {
    return fallback.data as RestaurantContext;
  }

  return null;
}

export async function GET() {
  try {
    const sb = supabaseAdmin();
    const ctx = await resolveRestaurantContext(sb);

    const { data, error } = await sb
      .from('pedidos')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      pedidos: data ?? [],
      restaurant: ctx
        ? {
            id: ctx.id,
            slug: ctx.slug,
            plan: normalizePlan(ctx.plan),
          }
        : null,
    });
  } catch (error) {
    console.error('GET /api/pedidos', error);

    return NextResponse.json(
      { error: 'No se pudieron cargar los pedidos.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<CreatePedidoBody>;
    const sb = supabaseAdmin();

    const mesaId = Number(body?.mesa_id);
    const total = Number(body?.total ?? 0);
    const formaPago = body?.forma_pago === 'efectivo' ? 'efectivo' : 'virtual';
    const origen = String(body?.origen ?? 'salon').trim() || 'salon';
    const tipoServicio = String(body?.tipo_servicio ?? 'mesa').trim() || 'mesa';
    const items = Array.isArray(body?.items) ? body.items : [];

    if (!Number.isFinite(mesaId) || mesaId <= 0) {
      return NextResponse.json(
        { error: 'mesa_id inválido.' },
        { status: 400 }
      );
    }

    if (!Number.isFinite(total) || total < 0) {
      return NextResponse.json(
        { error: 'total inválido.' },
        { status: 400 }
      );
    }

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'El pedido no tiene ítems.' },
        { status: 400 }
      );
    }

    for (const item of items) {
      const productoId = Number(item?.producto_id);
      const cantidad = Number(item?.cantidad);

      if (!Number.isFinite(productoId) || productoId <= 0) {
        return NextResponse.json(
          { error: 'producto_id inválido en los ítems.' },
          { status: 400 }
        );
      }

      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        return NextResponse.json(
          { error: 'cantidad inválida en los ítems.' },
          { status: 400 }
        );
      }
    }

    const restaurant = await resolveRestaurantContext(sb);
    const plan = normalizePlan(restaurant?.plan);

    const estadoInicial = getInitialPedidoEstado({
      plan,
      origen,
      tipo_servicio: tipoServicio,
    });

    const payloadPedido = {
      mesa_id: mesaId,
      estado: estadoInicial,
      total,
      paga_efectivo:
        typeof body?.paga_efectivo === 'boolean'
          ? body.paga_efectivo
          : formaPago === 'efectivo',
      forma_pago: formaPago,
      origen,
      tipo_servicio: tipoServicio,
      medio_pago:
        String(body?.medio_pago ?? '').trim() || formaPago,
      estado_pago:
        String(body?.estado_pago ?? '').trim() ||
        (formaPago === 'efectivo' ? 'aprobado' : 'pendiente'),
      efectivo_aprobado:
        typeof body?.efectivo_aprobado === 'boolean'
          ? body.efectivo_aprobado
          : formaPago === 'efectivo',
    };

    const { data: pedido, error: pedidoError } = await sb
      .from('pedidos')
      .insert(payloadPedido)
      .select()
      .single();

    if (pedidoError || !pedido) {
      console.error('POST /api/pedidos - error creando pedido', pedidoError);

      return NextResponse.json(
        {
          error:
            pedidoError?.message || 'No se pudo crear el pedido.',
        },
        { status: 500 }
      );
    }

    const payloadItems = items.map((item) => ({
      pedido_id: pedido.id,
      producto_id: Number(item.producto_id),
      cantidad: Number(item.cantidad),
      comentarios:
        typeof item.comentarios === 'string' && item.comentarios.trim()
          ? item.comentarios.trim()
          : null,
    }));

    const { error: itemsError } = await sb
      .from('items_pedido')
      .insert(payloadItems);

    if (itemsError) {
      console.error('POST /api/pedidos - error creando items', itemsError);

      await sb.from('pedidos').delete().eq('id', pedido.id);

      return NextResponse.json(
        {
          error:
            itemsError.message || 'No se pudieron guardar los ítems del pedido.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        pedido,
        meta: {
          plan,
          estado_inicial: estadoInicial,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/pedidos', error);

    return NextResponse.json(
      { error: 'Ocurrió un error inesperado al crear el pedido.' },
      { status: 500 }
    );
  }
}