import { NextRequest, NextResponse } from 'next/server';
import { getRestaurantContext } from '@/lib/tenant';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIN_MESA_ID = 0;
const STOCK_CONFLICT_PREFIX = 'STOCK_CONFLICT:';

type RestaurantContext = {
  id: string | number;
  slug: string;
  plan?: string | null;
};

type BusinessMode = 'restaurant' | 'takeaway';
type TipoServicio = 'mesa' | 'delivery' | 'takeaway';
type IdentityKind = 'mesa' | 'persona' | 'delivery';
type PrepTarget = 'mostrador' | 'cocina';
type KitchenPrepState = 'pendiente' | 'en_preparacion' | 'listo';

type LocalConfigRow = {
  business_mode?: string | null;
};

type PedidoItemInput = {
  producto_id: number;
  cantidad: number;
  comentarios?: string | null;
  prep_target?: PrepTarget | null;
};

type SanitizedPedidoItemInput = {
  producto_id: number;
  cantidad: number;
  comentarios?: string | null;
  prep_target: PrepTarget;
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

type ProductoStockRow = {
  id: number;
  nombre: string;
  disponible: boolean | null;
  control_stock: boolean | null;
  stock_actual: number | null;
  permitir_sin_stock: boolean | null;
};

type AggregatedProductRequest = {
  producto_id: number;
  cantidad: number;
};

type AppliedStockAdjustment = {
  producto_id: number;
  previous_stock: number;
  previous_disponible: boolean | null;
};

function normalizePlan(plan: unknown): 'esencial' | 'pro' | 'intelligence' {
  const value = String(plan ?? '').trim().toLowerCase();

  if (value === 'pro') return 'pro';
  if (value === 'intelligence') return 'intelligence';
  return 'esencial';
}

function normalizeBusinessMode(value: unknown): BusinessMode {
  return String(value ?? '').trim().toLowerCase() === 'takeaway'
    ? 'takeaway'
    : 'restaurant';
}

function normalizeTipoServicio(
  value: unknown,
  fallback: TipoServicio = 'mesa'
): TipoServicio {
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

  if (raw === 'mesa' || raw === 'salon' || raw === 'restaurant') {
    return 'mesa';
  }

  return fallback;
}

function inferTipoServicioFromBusinessMode(
  businessMode: BusinessMode
): TipoServicio {
  return businessMode === 'takeaway' ? 'takeaway' : 'mesa';
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

function normalizePrepTarget(value: unknown): PrepTarget {
  return String(value ?? '').trim().toLowerCase() === 'cocina'
    ? 'cocina'
    : 'mostrador';
}

function parseKitchenMeta(comment: string | null | undefined) {
  const raw = String(comment ?? '').trim();

  if (!raw) {
    return {
      viaKitchen: false,
      kitchenState: null as KitchenPrepState | null,
      cleanComment: null as string | null,
    };
  }

  const match = raw.match(
    /^\[\[COCINA:(pendiente|en_preparacion|listo)\]\]\s*(.*)$/i
  );

  if (!match) {
    return {
      viaKitchen: false,
      kitchenState: null,
      cleanComment: raw,
    };
  }

  return {
    viaKitchen: true,
    kitchenState: match[1].toLowerCase() as KitchenPrepState,
    cleanComment: normalizeOptionalText(match[2]),
  };
}

function buildKitchenComment(
  comment: string | null | undefined,
  kitchenState: KitchenPrepState | null
) {
  const clean = normalizeOptionalText(comment);

  if (!kitchenState) {
    return clean;
  }

  return `[[COCINA:${kitchenState}]]${clean ? ` ${clean}` : ''}`;
}

function getIdentityKind(tipoServicio: TipoServicio): IdentityKind {
  if (tipoServicio === 'delivery') return 'delivery';
  if (tipoServicio === 'takeaway') return 'persona';
  return 'mesa';
}

function getInitialPedidoEstado(params: {
  plan: 'esencial' | 'pro' | 'intelligence';
  origen?: string | null;
  tipo_servicio?: string | null;
}) {
  const origen = String(params.origen ?? 'salon').trim().toLowerCase();
  const tipoServicio = normalizeTipoServicio(params.tipo_servicio, 'mesa');

  const esSalonClienteAuto = origen === 'salon' && tipoServicio === 'mesa';

  if (!esSalonClienteAuto) {
    return 'pendiente';
  }

  if (params.plan === 'esencial') {
    return 'pendiente';
  }

  return 'solicitado';
}

function planHasStockControl(plan: 'esencial' | 'pro' | 'intelligence') {
  return plan === 'pro' || plan === 'intelligence';
}

function aggregateRequestedProducts(items: SanitizedPedidoItemInput[]) {
  const map = new Map<number, number>();

  for (const item of items) {
    const current = map.get(item.producto_id) ?? 0;
    map.set(item.producto_id, current + item.cantidad);
  }

  return Array.from(map.entries()).map(([producto_id, cantidad]) => ({
    producto_id,
    cantidad,
  })) as AggregatedProductRequest[];
}

async function loadProductsForStock(
  productoIds: number[]
): Promise<Map<number, ProductoStockRow>> {
  const { data, error } = await supabaseAdmin
    .from('productos')
    .select(
      'id, nombre, disponible, control_stock, stock_actual, permitir_sin_stock'
    )
    .in('id', productoIds);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as ProductoStockRow[];
  const map = new Map<number, ProductoStockRow>();

  for (const row of rows) {
    map.set(Number(row.id), row);
  }

  return map;
}

function validateStockAvailability(
  requestedProducts: AggregatedProductRequest[],
  productsMap: Map<number, ProductoStockRow>
) {
  const missingProducts: number[] = [];
  const insufficientProducts: Array<{
    nombre: string;
    solicitado: number;
    disponible: number;
  }> = [];

  for (const requested of requestedProducts) {
    const product = productsMap.get(requested.producto_id);

    if (!product) {
      missingProducts.push(requested.producto_id);
      continue;
    }

    const controlStock = !!product.control_stock;
    const permitirSinStock = !!product.permitir_sin_stock;
    const stockActual = Number(product.stock_actual ?? 0);

    if (controlStock && !permitirSinStock && stockActual < requested.cantidad) {
      insufficientProducts.push({
        nombre: product.nombre,
        solicitado: requested.cantidad,
        disponible: stockActual,
      });
    }
  }

  return {
    missingProducts,
    insufficientProducts,
  };
}

async function rollbackPedidoCreation(pedidoId: number) {
  try {
    await supabaseAdmin.from('items_pedido').delete().eq('pedido_id', pedidoId);
    await supabaseAdmin.from('pedidos').delete().eq('id', pedidoId);
  } catch (error) {
    console.error('Rollback de pedido fallido:', error);
  }
}

async function rollbackStockAdjustments(
  adjustments: AppliedStockAdjustment[]
) {
  for (const adjustment of adjustments) {
    try {
      await supabaseAdmin
        .from('productos')
        .update({
          stock_actual: adjustment.previous_stock,
          disponible: adjustment.previous_disponible,
        })
        .eq('id', adjustment.producto_id);
    } catch (error) {
      console.error(
        `No se pudo revertir stock del producto ${adjustment.producto_id}:`,
        error
      );
    }
  }
}

async function applyStockAdjustments(params: {
  requestedProducts: AggregatedProductRequest[];
  productsMap: Map<number, ProductoStockRow>;
}) {
  const { requestedProducts, productsMap } = params;
  const appliedAdjustments: AppliedStockAdjustment[] = [];

  for (const requested of requestedProducts) {
    const product = productsMap.get(requested.producto_id);

    if (!product || !product.control_stock) {
      continue;
    }

    const previousStock = Number(product.stock_actual ?? 0);
    const previousDisponible = product.disponible ?? null;
    const permitirSinStock = !!product.permitir_sin_stock;

    const nextStock = permitirSinStock
      ? Math.max(previousStock - requested.cantidad, 0)
      : previousStock - requested.cantidad;

    const nextDisponible = permitirSinStock
      ? previousDisponible
      : nextStock > 0
      ? previousDisponible
      : false;

    const { data, error } = await supabaseAdmin
      .from('productos')
      .update({
        stock_actual: nextStock,
        disponible: nextDisponible,
      })
      .eq('id', requested.producto_id)
      .eq('control_stock', true)
      .eq('permitir_sin_stock', permitirSinStock)
      .eq('stock_actual', previousStock)
      .select('id')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data?.id) {
      throw new Error(`${STOCK_CONFLICT_PREFIX}${product.nombre}`);
    }

    appliedAdjustments.push({
      producto_id: requested.producto_id,
      previous_stock: previousStock,
      previous_disponible: previousDisponible,
    });
  }

  return appliedAdjustments;
}

async function resolveRestaurantContext() {
  const ctx = await getRestaurantContext().catch(() => null);

  if (ctx?.id) {
    return ctx as RestaurantContext;
  }

  const defaultTenantId = process.env.DEFAULT_TENANT_ID?.trim();

  if (defaultTenantId) {
    const bySlug = await supabaseAdmin
      .from('restaurants')
      .select('id, slug, plan')
      .eq('slug', defaultTenantId)
      .maybeSingle();

    if (!bySlug.error && bySlug.data?.id) {
      return bySlug.data as RestaurantContext;
    }
  }

  const fallback = await supabaseAdmin
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

async function resolveBusinessMode() {
  const result = await supabaseAdmin
    .from('configuracion_local')
    .select('business_mode')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    console.error(
      'POST /api/pedidos - no se pudo leer business_mode:',
      result.error
    );
    return 'restaurant' as BusinessMode;
  }

  const config = (result.data ?? null) as LocalConfigRow | null;
  return normalizeBusinessMode(config?.business_mode);
}

async function resolveMesaIdForPedido(
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

  const { data: mesa, error: mesaError } = await supabaseAdmin
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
  const kitchenMeta = parseKitchenMeta(comment);
  const raw = String(kitchenMeta.cleanComment ?? '').trim();

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

  const sanitizedItems: SanitizedPedidoItemInput[] = items.map((item, index) => {
    const comentarioOriginal =
      typeof item?.comentarios === 'string' ? item.comentarios : null;
    const prepTarget = normalizePrepTarget(item?.prep_target);

    if (index !== 0) {
      const kitchenMeta = parseKitchenMeta(comentarioOriginal);

      return {
        producto_id: Number(item.producto_id),
        cantidad: Number(item.cantidad),
        comentarios: normalizeOptionalText(kitchenMeta.cleanComment),
        prep_target: prepTarget,
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
      prep_target: prepTarget,
    };
  });

  return {
    clienteNombre,
    sanitizedItems,
  };
}

export async function GET() {
  try {
    const ctx = await resolveRestaurantContext();
    const businessMode = await resolveBusinessMode();

    const { data, error } = await supabaseAdmin
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
      meta: {
        business_mode: businessMode,
        default_identity: businessMode === 'takeaway' ? 'persona' : 'mesa',
      },
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

    const restaurant = await resolveRestaurantContext();
    const plan = normalizePlan(restaurant?.plan);
    const businessMode = await resolveBusinessMode();
    const stockControlEnabled = planHasStockControl(plan);

    const rawMesaId = Number(body?.mesa_id);
    const total = Number(body?.total ?? 0);
    const formaPago = body?.forma_pago === 'efectivo' ? 'efectivo' : 'virtual';
    const requestedTipoServicio = body?.tipo_servicio;
    const tipoServicio = normalizeTipoServicio(
      requestedTipoServicio,
      inferTipoServicioFromBusinessMode(businessMode)
    );
    const origen = normalizeOrigen(body?.origen, tipoServicio);
    const identityKind = getIdentityKind(tipoServicio);
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
        : {
            clienteNombre: null as string | null,
            sanitizedItems: rawItems.map((item) => {
              const kitchenMeta = parseKitchenMeta(item?.comentarios ?? null);

              return {
                producto_id: Number(item.producto_id),
                cantidad: Number(item.cantidad),
                comentarios: normalizeOptionalText(kitchenMeta.cleanComment),
                prep_target: normalizePrepTarget(item?.prep_target),
              };
            }) as SanitizedPedidoItemInput[],
          };

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

    if (tipoServicio === 'delivery' && !direccionEntrega) {
      return NextResponse.json(
        { error: 'direccion_entrega es obligatoria para delivery.' },
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

    const requestedProducts = aggregateRequestedProducts(items);
    const productoIds = requestedProducts.map((item) => item.producto_id);

    let productsMap = new Map<number, ProductoStockRow>();

    if (stockControlEnabled) {
      productsMap = await loadProductsForStock(productoIds);

      const { missingProducts, insufficientProducts } = validateStockAvailability(
        requestedProducts,
        productsMap
      );

      if (missingProducts.length > 0) {
        return NextResponse.json(
          {
            error: `No se encontraron algunos productos del pedido: ${missingProducts.join(', ')}.`,
          },
          { status: 400 }
        );
      }

      if (insufficientProducts.length > 0) {
        const detail = insufficientProducts
          .map(
            (item) =>
              `${item.nombre} (solicitado: ${item.solicitado}, disponible: ${item.disponible})`
          )
          .join('; ');

        return NextResponse.json(
          {
            error: `Stock insuficiente para completar el pedido: ${detail}.`,
          },
          { status: 409 }
        );
      }
    }

    const mesaResolution = await resolveMesaIdForPedido(rawMesaId, tipoServicio);

    if (!mesaResolution.ok) {
      return mesaResolution.response;
    }

    const mesaIdResolved = mesaResolution.mesaId;

    const estadoBase = getInitialPedidoEstado({
      plan,
      origen,
      tipo_servicio: tipoServicio,
    });

    const hasKitchenItems = items.some((item) => item.prep_target === 'cocina');
    const estadoInicial = hasKitchenItems ? 'en_preparacion' : estadoBase;

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
      direccion_entrega: tipoServicio === 'delivery' ? direccionEntrega : null,
    };

    const { data: pedido, error: pedidoError } = await supabaseAdmin
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
        item.prep_target === 'cocina'
          ? buildKitchenComment(item.comentarios, 'pendiente')
          : normalizeOptionalText(item.comentarios),
    }));

    const { error: itemsError } = await supabaseAdmin
      .from('items_pedido')
      .insert(payloadItems);

    if (itemsError) {
      console.error('POST /api/pedidos - error creando items', itemsError);

      await rollbackPedidoCreation(Number(pedido.id));

      return NextResponse.json(
        {
          error:
            itemsError.message || 'No se pudieron guardar los ítems del pedido.',
        },
        { status: 500 }
      );
    }

    let appliedAdjustments: AppliedStockAdjustment[] = [];

    if (stockControlEnabled) {
      try {
        appliedAdjustments = await applyStockAdjustments({
          requestedProducts,
          productsMap,
        });
      } catch (error) {
        console.error('POST /api/pedidos - error aplicando stock', error);

        await rollbackStockAdjustments(appliedAdjustments);
        await rollbackPedidoCreation(Number(pedido.id));

        const message =
          error instanceof Error ? error.message : 'No se pudo actualizar el stock.';

        if (message.startsWith(STOCK_CONFLICT_PREFIX)) {
          const productName = message.replace(STOCK_CONFLICT_PREFIX, '').trim();

          return NextResponse.json(
            {
              error: `El stock cambió mientras se procesaba el pedido${productName ? ` para "${productName}"` : ''}. Reintentá con la información actualizada.`,
            },
            { status: 409 }
          );
        }

        return NextResponse.json(
          {
            error: 'No se pudo actualizar el stock del pedido.',
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      {
        ok: true,
        pedido,
        meta: {
          plan,
          business_mode_resuelto: businessMode,
          identidad_principal:
            businessMode === 'takeaway' ? 'persona' : 'mesa',
          identity_kind: identityKind,
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
          has_kitchen_items: hasKitchenItems,
          stock_control_applied: stockControlEnabled,
          stock_updates: appliedAdjustments.length,
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