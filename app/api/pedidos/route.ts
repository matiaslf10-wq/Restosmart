import { NextRequest, NextResponse } from 'next/server';
import { getRestaurantContext } from '@/lib/tenant';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIN_MESA_ID = 0;

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

type TipoServicio = 'mesa' | 'delivery' | 'takeaway';

type PedidoItemInput = {
  producto_id: number;
  cantidad: number;
  comentarios?: string | null;
};

type CreatePedidoBody = {
  mesa_id?: number | null;
  total: number;
  forma_pago: 'virtual' | 'efectivo';
  origen?: string | null;
  tipo_servicio?: string | null;
  medio_pago?: string | null;
  estado_pago?: string | null;
  efectivo_aprobado?: boolean | null;
  paga_efectivo?: boolean | null;
  cliente_nombre?: string | null;
  cliente_telefono?: string | null;
  direccion_entrega?: string | null;
  items: PedidoItemInput[];
};

function normalizePlan(plan: unknown): 'esencial' | 'pro' | 'intelligence' {
  const value = String(plan ?? '').trim().toLowerCase();

  if (value === 'pro') return 'pro';
  if (value === 'intelligence') return 'intelligence';
  return 'esencial';
}

function normalizeTipoServicio(value: unknown): TipoServicio {
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

function normalizeOrigen(value: unknown, tipoServicio: TipoServicio) {
  const raw = String(value ?? '').trim().toLowerCase();

  if (raw) return raw;

  if (tipoServicio === 'delivery') return 'delivery';
  if (tipoServicio === 'takeaway') return 'takeaway';
  return 'salon';
}

function normalizeOptionalText(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length ? text : null;
}

function getInitialPedidoEstado(params: {
  plan: 'esencial' | 'pro' | 'intelligence';
  origen?: string | null;
  tipo_servicio?: string | null;
}) {
  const origen = String(params.origen ?? 'salon').trim().toLowerCase();
  const tipoServicio = normalizeTipoServicio(params.tipo_servicio);

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

async function resolveMesaIdForPedido(
  sb: ReturnType<typeof supabaseAdmin>,
  rawMesaId: number,
  tipoServicio: TipoServicio
) {
  if (tipoServicio !== 'mesa') {
    return { ok: true as const, mesaId: SIN_MESA_ID };
  }

  if (!Number.isFinite(rawMesaId) || rawMesaId <= SIN_MESA_ID) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'mesa_id inválido para un pedido de mesa.' },
        { status: 400 }
      ),
    };
  }

  const { data: mesa, error: mesaError } = await sb
    .from('mesas')
    .select('id')
    .eq('id', rawMesaId)
    .maybeSingle();

  if (mesaError) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: `No se pudo validar la mesa seleccionada: ${mesaError.message}`,
        },
        { status: 500 }
      ),
    };
  }

  if (!mesa?.id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'La mesa indicada no existe.' },
        { status: 400 }
      ),
    };
  }

  return { ok: true as const, mesaId: rawMesaId };
}

function parseTakeawayMarker(comment: string | null | undefined) {
  const raw = String(comment ?? '').trim();

  if (!raw) {
    return {
      clienteNombre: null as string | null,
      comentarioLimpio: null as string | null,
    };
  }

  const match = raw.match(/^retiro\s*:\s*(.+?)(?:\s*·\s*(.+))?$/i);

  if (!match) {
    return {
      clienteNombre: null,
      comentarioLimpio: raw,
    };
  }

  const clienteNombre = normalizeOptionalText(match[1]);
  const comentarioLimpio = normalizeOptionalText(match[2]);

  return {
    clienteNombre,
    comentarioLimpio,
  };
}

function extractTakeawayDataFromItems(items: PedidoItemInput[]) {
  let clienteNombre: string | null = null;

  const sanitizedItems = items.map((item, index) => {
    const comentarioOriginal =
      typeof item?.comentarios === 'string' ? item.comentarios : null;

    if (index !== 0) {
      return {
        producto_id: Number(item.producto_id),
        cantidad: Number(item.cantidad),
        comentarios: normalizeOptionalText(comentarioOriginal),
      };
    }

    const parsed = parseTakeawayMarker(comentarioOriginal);

    if (parsed.clienteNombre && !clienteNombre) {
      clienteNombre = parsed.clienteNombre;
    }

    return {
      producto_id: Number(item.producto_id),
      cantidad: Number(item.cantidad),
      comentarios: parsed.comentarioLimpio,
    };
  });

  return {
    clienteNombre,
    sanitizedItems,
  };
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

    const rawMesaId = Number(body?.mesa_id);
    const total = Number(body?.total ?? 0);
    const formaPago = body?.forma_pago === 'efectivo' ? 'efectivo' : 'virtual';
    const tipoServicio = normalizeTipoServicio(body?.tipo_servicio);
    const origen = normalizeOrigen(body?.origen, tipoServicio);
    const rawItems = Array.isArray(body?.items) ? body.items : [];

    if (!Number.isFinite(total) || total < 0) {
      return NextResponse.json({ error: 'total inválido.' }, { status: 400 });
    }

    if (rawItems.length === 0) {
      return NextResponse.json(
        { error: 'El pedido no tiene ítems.' },
        { status: 400 }
      );
    }

    const extractedTakeawayData =
      tipoServicio === 'takeaway'
        ? extractTakeawayDataFromItems(rawItems)
        : { clienteNombre: null as string | null, sanitizedItems: rawItems };

    const items = extractedTakeawayData.sanitizedItems;
    const clienteNombre =
      normalizeOptionalText(body?.cliente_nombre) ??
      extractedTakeawayData.clienteNombre;

    const clienteTelefono = normalizeOptionalText(body?.cliente_telefono);
    const direccionEntrega = normalizeOptionalText(body?.direccion_entrega);

    if (tipoServicio === 'takeaway' && !clienteNombre) {
      return NextResponse.json(
        { error: 'cliente_nombre es obligatorio para take away.' },
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

    const mesaResolution = await resolveMesaIdForPedido(
      sb,
      rawMesaId,
      tipoServicio
    );

    if (!mesaResolution.ok) {
      return mesaResolution.response;
    }

    const mesaIdResolved = mesaResolution.mesaId;

    const restaurant = await resolveRestaurantContext(sb);
    const plan = normalizePlan(restaurant?.plan);

    const estadoInicial = getInitialPedidoEstado({
      plan,
      origen,
      tipo_servicio: tipoServicio,
    });

    const payloadPedido = {
      mesa_id: mesaIdResolved,
      estado: estadoInicial,
      total,
      paga_efectivo:
        typeof body?.paga_efectivo === 'boolean'
          ? body.paga_efectivo
          : formaPago === 'efectivo',
      forma_pago: formaPago,
      origen,
      tipo_servicio: tipoServicio,
      medio_pago: String(body?.medio_pago ?? '').trim() || formaPago,
      estado_pago:
        String(body?.estado_pago ?? '').trim() ||
        (formaPago === 'efectivo' ? 'aprobado' : 'pendiente'),
      efectivo_aprobado:
        typeof body?.efectivo_aprobado === 'boolean'
          ? body.efectivo_aprobado
          : formaPago === 'efectivo',
      cliente_nombre: clienteNombre,
      cliente_telefono: clienteTelefono,
      direccion_entrega:
        tipoServicio === 'delivery' ? direccionEntrega : null,
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
          error: pedidoError?.message || 'No se pudo crear el pedido.',
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
          mesa_id_resuelto: mesaIdResolved,
          tipo_servicio: tipoServicio,
          origen,
          cliente_nombre_resuelto: clienteNombre,
          canal_operativo:
            tipoServicio === 'takeaway'
              ? 'takeaway'
              : tipoServicio === 'delivery'
              ? 'delivery'
              : 'restaurant',
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