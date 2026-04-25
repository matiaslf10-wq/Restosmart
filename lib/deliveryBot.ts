import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendWhatsAppText } from './whatsapp';
import type { WhatsAppConnection } from '@/types/whatsapp';

const DELIVERY_MESA_ID = 0;
const MAX_MENU_ITEMS = 20;
const MAX_ALLOWED_QUANTITY = 50;

type DeliveryCartItem = {
  producto_id: number;
  nombre: string;
  precio: number;
  cantidad: number;
};

type DeliveryConversation = {
  id: number;
  telefono: string;
  restaurant_id?: string | number | null;
  estado: string;
  carrito: DeliveryCartItem[] | null;
  nombre_cliente?: string | null;
  direccion?: string | null;
  medio_pago?: string | null;
};

type PedidoDeliveryCreado = {
  id: number;
  mesa_id: number;
  estado: string;
  estado_pago: string;
  codigo_publico: string;
};

type DeliveryConfig = {
  activo: boolean;
  whatsapp_numero: string;
  whatsapp_nombre_mostrado: string;
  acepta_efectivo: boolean;
  efectivo_requiere_aprobacion: boolean;
  acepta_mercadopago: boolean;
  mensaje_bienvenida: string;
  tiempo_estimado_min: number;
  costo_envio: number;
};

type HandleIncomingWhatsAppMessageParams = {
  telefono: string;
  incomingText: string;
  connection?: WhatsAppConnection | null;
};

type RestaurantContext = {
  id: string | number;
  slug: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeOptionalText(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeOptionalText(value);
    if (normalized) return normalized;
  }

  return null;
}

async function resolveDeliveryRestaurantContext(
  connection?: WhatsAppConnection | null
): Promise<RestaurantContext | null> {
  const connectionRecord = asRecord(connection);

  const restaurantId = pickFirstString(
    connectionRecord?.restaurant_id,
    connectionRecord?.restaurantId
  );

  if (restaurantId) {
    const byId = await supabaseAdmin
      .from('restaurants')
      .select('id, slug')
      .eq('id', restaurantId)
      .maybeSingle();

    if (!byId.error && byId.data?.id) {
      return byId.data as RestaurantContext;
    }
  }

  const restaurantSlug = pickFirstString(
    connectionRecord?.restaurant_slug,
    connectionRecord?.restaurantSlug,
    connectionRecord?.tenant_id,
    connectionRecord?.tenantId,
    connectionRecord?.slug
  );

  if (restaurantSlug) {
    const bySlug = await supabaseAdmin
      .from('restaurants')
      .select('id, slug')
      .eq('slug', restaurantSlug)
      .maybeSingle();

    if (!bySlug.error && bySlug.data?.id) {
      return bySlug.data as RestaurantContext;
    }
  }

  const defaultTenantId = process.env.DEFAULT_TENANT_ID?.trim();

  if (defaultTenantId) {
    const fallbackBySlug = await supabaseAdmin
      .from('restaurants')
      .select('id, slug')
      .eq('slug', defaultTenantId)
      .maybeSingle();

    if (!fallbackBySlug.error && fallbackBySlug.data?.id) {
      return fallbackBySlug.data as RestaurantContext;
    }
  }

  const fallback = await supabaseAdmin
    .from('restaurants')
    .select('id, slug')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!fallback.error && fallback.data?.id) {
    return fallback.data as RestaurantContext;
  }

  return null;
}

const DEFAULT_DELIVERY_CONFIG: DeliveryConfig = {
  activo: false,
  whatsapp_numero: '',
  whatsapp_nombre_mostrado: '',
  acepta_efectivo: true,
  efectivo_requiere_aprobacion: true,
  acepta_mercadopago: false,
  mensaje_bienvenida:
    'Hola 👋 Gracias por comunicarte con nosotros. Decime qué querés pedir y te ayudamos con tu compra.',
  tiempo_estimado_min: 45,
  costo_envio: 0,
};

function normalizeText(text: string) {
  return text.trim().toLowerCase();
}

function parseQuantityAndProduct(text: string) {
  const match = text.match(/^(\d+)\s*x\s*(.+)$/i);
  if (!match) return null;

  const cantidad = Number(match[1]);

  if (!Number.isFinite(cantidad) || cantidad < 1 || cantidad > MAX_ALLOWED_QUANTITY) {
    return null;
  }

  return {
    cantidad,
    nombre: match[2].trim().toLowerCase(),
  };
}

function buildDeliveryPublicCode(pedidoId: number) {
  return `DEL-${String(pedidoId).padStart(6, '0')}`;
}

function calcularSubtotal(carrito: DeliveryCartItem[]) {
  return carrito.reduce((acc, item) => {
    return acc + Number(item.precio ?? 0) * Number(item.cantidad ?? 0);
  }, 0);
}

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim() || '';
}

function normalizeDeliveryConfig(row: Record<string, unknown> | null | undefined): DeliveryConfig {
  return {
    activo: !!row?.activo,
    whatsapp_numero: String(row?.whatsapp_numero ?? ''),
    whatsapp_nombre_mostrado: String(row?.whatsapp_nombre_mostrado ?? ''),
    acepta_efectivo:
      row?.acepta_efectivo === undefined || row?.acepta_efectivo === null
        ? true
        : !!row.acepta_efectivo,
    efectivo_requiere_aprobacion:
      row?.efectivo_requiere_aprobacion === undefined ||
      row?.efectivo_requiere_aprobacion === null
        ? true
        : !!row.efectivo_requiere_aprobacion,
    acepta_mercadopago: !!row?.acepta_mercadopago,
    mensaje_bienvenida:
      String(row?.mensaje_bienvenida ?? '').trim() ||
      DEFAULT_DELIVERY_CONFIG.mensaje_bienvenida,
    tiempo_estimado_min:
      Number(row?.tiempo_estimado_min ?? DEFAULT_DELIVERY_CONFIG.tiempo_estimado_min) ||
      DEFAULT_DELIVERY_CONFIG.tiempo_estimado_min,
    costo_envio: Number(row?.costo_envio ?? 0) || 0,
  };
}

function addOrMergeCartItem(carrito: DeliveryCartItem[], nuevoItem: DeliveryCartItem) {
  const existingIndex = carrito.findIndex(
    (item) => item.producto_id === nuevoItem.producto_id
  );

  if (existingIndex === -1) {
    return [...carrito, nuevoItem];
  }

  return carrito.map((item, index) =>
    index === existingIndex
      ? { ...item, cantidad: item.cantidad + nuevoItem.cantidad }
      : item
  );
}

function buildPaymentOptionsMessage(config: DeliveryConfig) {
  const lines: string[] = [];

  if (config.acepta_mercadopago) {
    lines.push('1) Mercado Pago');
  }

  if (config.acepta_efectivo) {
    lines.push('2) Efectivo');
  }

  if (lines.length === 0) {
    return 'En este momento no hay medios de pago habilitados para delivery.';
  }

  return `¿Cómo querés pagar?\n${lines.join('\n')}`;
}

async function getDeliveryConfig(restaurantId: string | number | null) {
  let query = supabaseAdmin
    .from('configuracion_delivery')
    .select('*');

  if (restaurantId != null) {
    query = query.eq('restaurant_id', restaurantId);
  }

  const { data, error } = await query
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('No se pudo leer configuracion_delivery', error);
    return DEFAULT_DELIVERY_CONFIG;
  }

  return normalizeDeliveryConfig((data as Record<string, unknown> | null) ?? null);
}

async function getConversation(
  telefono: string,
  restaurantId: string | number | null
) {
  let existingQuery = supabaseAdmin
    .from('delivery_conversaciones')
    .select('*')
    .eq('telefono', telefono);

  if (restaurantId != null) {
    existingQuery = existingQuery.eq('restaurant_id', restaurantId);
  }

  const existing = await existingQuery.maybeSingle();

  if (existing.error) {
    throw new Error(
      existing.error.message || 'No se pudo leer la conversación de delivery.'
    );
  }

  if (existing.data) {
    return existing.data as DeliveryConversation;
  }

  const inserted = await supabaseAdmin
    .from('delivery_conversaciones')
    .insert({
      telefono,
      restaurant_id: restaurantId,
      estado: 'inicio',
      carrito: [],
    })
    .select('*')
    .single();

  if (inserted.error || !inserted.data) {
    throw new Error(
      inserted.error?.message || 'No se pudo crear la conversación de delivery.'
    );
  }

  return inserted.data as DeliveryConversation;
}

async function updateConversation(id: number, patch: Record<string, unknown>) {
  const result = await supabaseAdmin
    .from('delivery_conversaciones')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (result.error) {
    throw new Error(
      result.error.message || 'No se pudo actualizar la conversación.'
    );
  }
}

async function findProductByName(name: string) {
  const result = await supabaseAdmin
    .from('productos')
    .select('id, nombre, precio, disponible')
    .ilike('nombre', `%${name}%`)
    .eq('disponible', true)
    .order('nombre', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message || 'No se pudo buscar el producto.');
  }

  return result.data;
}

async function listAvailableProducts() {
  const result = await supabaseAdmin
    .from('productos')
    .select('id, nombre, precio')
    .eq('disponible', true)
    .order('id', { ascending: true });

  if (result.error) {
    throw new Error(
      result.error.message || 'No se pudo listar el menú disponible.'
    );
  }

  return result.data ?? [];
}

async function getLatestPendingMercadoPagoOrderByPhone(
  telefono: string,
  restaurantId: string | number | null
) {
  let query = supabaseAdmin
    .from('pedidos')
    .select('id, mesa_id, estado, estado_pago, codigo_publico')
    .eq('cliente_telefono', telefono)
    .eq('medio_pago', 'mercadopago')
    .eq('origen', 'delivery_whatsapp')
    .eq('estado_pago', 'pendiente');

  if (restaurantId != null) {
    query = query.eq('restaurant_id', restaurantId);
  }

  const result = await query
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw new Error(
      result.error.message || 'No se pudo recuperar el pedido pendiente.'
    );
  }

  return result.data as PedidoDeliveryCreado | null;
}

async function crearPedidoDeliveryDesdeConversacion(params: {
  telefono: string;
  conv: DeliveryConversation;
  medioPago: 'efectivo' | 'mercadopago';
  deliveryConfig: DeliveryConfig;
  restaurantId: string | number | null;
}): Promise<PedidoDeliveryCreado> {
  const { telefono, conv, medioPago, deliveryConfig, restaurantId } = params;

  const carrito = Array.isArray(conv.carrito) ? conv.carrito : [];
  if (carrito.length === 0) {
    throw new Error('El carrito está vacío.');
  }

  const subtotal = calcularSubtotal(carrito);
  const costoEnvio = Math.max(0, Number(deliveryConfig.costo_envio ?? 0));
  const total = subtotal + costoEnvio;
  const esEfectivo = medioPago === 'efectivo';
  const requiereAprobacionEfectivo =
    esEfectivo && !!deliveryConfig.efectivo_requiere_aprobacion;

  const payload = {
  restaurant_id: restaurantId,
  mesa_id: DELIVERY_MESA_ID,
  estado: requiereAprobacionEfectivo ? 'solicitado' : 'pendiente',
  total,
  paga_efectivo: esEfectivo,
  forma_pago: esEfectivo ? 'efectivo' : 'virtual',
  origen: 'delivery_whatsapp',
  tipo_servicio: 'delivery',
  cliente_nombre: conv.nombre_cliente?.trim() || null,
  cliente_telefono: telefono,
  direccion_entrega: conv.direccion?.trim() || null,
  medio_pago: esEfectivo ? 'efectivo' : 'mercadopago',
  estado_pago: esEfectivo
    ? requiereAprobacionEfectivo
      ? 'esperando_aprobacion'
      : 'aprobado'
    : 'pendiente',
  efectivo_aprobado: esEfectivo ? !requiereAprobacionEfectivo : false,
  codigo_publico: null,
};

  const { data: pedido, error: errorPedido } = await supabaseAdmin
    .from('pedidos')
    .insert(payload)
    .select('id, mesa_id, estado, estado_pago, codigo_publico')
    .single();

  if (errorPedido || !pedido) {
    throw new Error(
      errorPedido?.message || 'No se pudo crear el pedido de delivery.'
    );
  }

  const codigoPublico = buildDeliveryPublicCode(pedido.id);

  const { error: errorCodigo } = await supabaseAdmin
    .from('pedidos')
    .update({ codigo_publico: codigoPublico })
    .eq('id', pedido.id);

  if (errorCodigo) {
    await supabaseAdmin.from('pedidos').delete().eq('id', pedido.id);
    throw new Error(
      errorCodigo.message || 'No se pudo asignar el código público del pedido.'
    );
  }

  const items = carrito.map((item) => ({
    pedido_id: pedido.id,
    producto_id: item.producto_id,
    cantidad: item.cantidad,
    comentarios: null,
  }));

  const { error: errorItems } = await supabaseAdmin
    .from('items_pedido')
    .insert(items);

  if (errorItems) {
    await supabaseAdmin.from('pedidos').delete().eq('id', pedido.id);
    throw new Error(
      errorItems.message || 'No se pudieron guardar los ítems del pedido.'
    );
  }

  return {
    ...pedido,
    codigo_publico: codigoPublico,
  };
}

async function crearPreferenciaMercadoPago(params: {
  pedido: PedidoDeliveryCreado;
  conv: DeliveryConversation;
}) {
  const { pedido, conv } = params;

  const appUrl = getAppUrl();
  if (!appUrl) {
    throw new Error('Falta NEXT_PUBLIC_APP_URL o APP_URL.');
  }

  const carrito = Array.isArray(conv.carrito) ? conv.carrito : [];
  if (carrito.length === 0) {
    throw new Error('No hay ítems para generar la preferencia de pago.');
  }

  const items = carrito.map((item) => ({
    title: item.nombre,
    quantity: item.cantidad,
    unit_price: Number(item.precio),
    currency_id: 'ARS',
  }));

  const res = await fetch(`${appUrl}/api/pagos/crear-preferencia`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items,
      external_reference: pedido.codigo_publico,
    }),
    cache: 'no-store',
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(
      data?.error?.message ||
        data?.error ||
        'No se pudo crear la preferencia de Mercado Pago.'
    );
  }

  const paymentUrl = data?.init_point || data?.sandbox_init_point;

  if (!paymentUrl) {
    throw new Error('Mercado Pago no devolvió un link de pago.');
  }

  return {
    paymentUrl: String(paymentUrl),
  };
}

async function reply(
  telefono: string,
  body: string,
  connection?: WhatsAppConnection | null
) {
  await sendWhatsAppText({
    to: telefono,
    body,
    connection: connection ?? null,
  });
}

export async function handleIncomingWhatsAppMessage({
  telefono,
  incomingText,
  connection = null,
}: HandleIncomingWhatsAppMessageParams) {
  const text = normalizeText(incomingText);
  const restaurant = await resolveDeliveryRestaurantContext(connection);
  const restaurantId = restaurant?.id ?? null;
  const deliveryConfig = await getDeliveryConfig(restaurantId);

  if (!deliveryConfig.activo) {
    await reply(
      telefono,
      'En este momento el canal de delivery está pausado. Probá nuevamente más tarde.',
      connection
    );
    return;
  }

  const conv = await getConversation(telefono, restaurantId);

  if (text === 'hola' || text === 'menu' || conv.estado === 'inicio') {
    const products = await listAvailableProducts();

    if (!products.length) {
      await reply(
        telefono,
        'En este momento no hay productos disponibles para delivery.',
        connection
      );
      return;
    }

    const menuText = products
      .slice(0, MAX_MENU_ITEMS)
      .map((p: any) => `- ${p.nombre} $${p.precio}`)
      .join('\n');

    await updateConversation(conv.id, { estado: 'armando_carrito' });

    const extras: string[] = [];

    if (deliveryConfig.costo_envio > 0) {
      extras.push(`Costo de envío: $${deliveryConfig.costo_envio}`);
    }

    if (deliveryConfig.tiempo_estimado_min > 0) {
      extras.push(`Tiempo estimado: ${deliveryConfig.tiempo_estimado_min} min`);
    }

    const extrasText = extras.length ? `\n\n${extras.join('\n')}` : '';

    await reply(
      telefono,
      `${deliveryConfig.mensaje_bienvenida}\n\nTe paso el menú:\n\n${menuText}${extrasText}\n\nPara agregar productos escribí por ejemplo:\n2 x hamburguesa\n1 x coca cola\n\nCuando termines, escribí: confirmar`,
      connection
    );
    return;
  }

  if (conv.estado === 'armando_carrito') {
    if (text === 'confirmar') {
      const carrito = conv.carrito ?? [];

      if (!carrito.length) {
        await reply(
          telefono,
          'Todavía no agregaste productos. Escribime por ejemplo: 2 x hamburguesa',
          connection
        );
        return;
      }

      if (!deliveryConfig.acepta_mercadopago && !deliveryConfig.acepta_efectivo) {
        await reply(
          telefono,
          'En este momento no hay medios de pago habilitados para delivery.',
          connection
        );
        return;
      }

      await updateConversation(conv.id, { estado: 'pidiendo_nombre' });

      await reply(
        telefono,
        'Perfecto. ¿A nombre de quién va el pedido?',
        connection
      );
      return;
    }

    const parsed = parseQuantityAndProduct(incomingText);

    if (!parsed) {
      await reply(
        telefono,
        'No entendí ese formato. Probá así: 2 x hamburguesa',
        connection
      );
      return;
    }

    const product = await findProductByName(parsed.nombre);

    if (!product) {
      await reply(
        telefono,
        `No encontré "${parsed.nombre}". Probá con otro nombre del menú.`,
        connection
      );
      return;
    }

    const cart = Array.isArray(conv.carrito) ? conv.carrito : [];
    const nextCart = addOrMergeCartItem(cart, {
      producto_id: product.id,
      nombre: product.nombre,
      precio: Number(product.precio),
      cantidad: parsed.cantidad,
    });

    await updateConversation(conv.id, { carrito: nextCart });

    await reply(
      telefono,
      `Agregado: ${parsed.cantidad} x ${product.nombre}\nEscribí otro producto o "confirmar".`,
      connection
    );
    return;
  }

  if (conv.estado === 'pidiendo_nombre') {
    await updateConversation(conv.id, {
      estado: 'pidiendo_direccion',
      nombre_cliente: incomingText.trim(),
    });

    await reply(
      telefono,
      'Pasame la dirección de entrega, por favor.',
      connection
    );
    return;
  }

  if (conv.estado === 'pidiendo_direccion') {
    await updateConversation(conv.id, {
      estado: 'pidiendo_pago',
      direccion: incomingText.trim(),
    });

    await reply(
      telefono,
      buildPaymentOptionsMessage(deliveryConfig),
      connection
    );
    return;
  }

  if (conv.estado === 'pidiendo_pago') {
    if (text === '1' || text.includes('mercado')) {
      if (!deliveryConfig.acepta_mercadopago) {
        await reply(
          telefono,
          'Mercado Pago no está habilitado en este momento. Elegí otra forma de pago.',
          connection
        );
        return;
      }

      try {
        const pedido = await crearPedidoDeliveryDesdeConversacion({
  telefono,
  conv,
  medioPago: 'mercadopago',
  deliveryConfig,
  restaurantId,
});

        const preferencia = await crearPreferenciaMercadoPago({
          pedido,
          conv,
        });

        await updateConversation(conv.id, {
          estado: 'esperando_pago',
          medio_pago: 'mercadopago',
          carrito: [],
        });

        const envioText =
          deliveryConfig.costo_envio > 0
            ? `\nEnvío: $${deliveryConfig.costo_envio}`
            : '';

        await reply(
          telefono,
          `Tu pedido ${pedido.codigo_publico} quedó registrado.\nCliente: ${conv.nombre_cliente ?? 'Sin nombre'}\nDirección: ${conv.direccion ?? 'Sin dirección'}${envioText}\n\nPagalo acá:\n${preferencia.paymentUrl}\n\nCuando Mercado Pago confirme el cobro, entra a cocina.`,
          connection
        );
      } catch (error) {
        console.error(error);
        await reply(
          telefono,
          'No pude registrar tu pedido o generar el link de pago en este momento. Probá nuevamente en unos minutos.',
          connection
        );
      }
      return;
    }

    if (text === '2' || text.includes('efectivo')) {
      if (!deliveryConfig.acepta_efectivo) {
        await reply(
          telefono,
          'El pago en efectivo no está habilitado en este momento. Elegí otra forma de pago.',
          connection
        );
        return;
      }

      try {
        const pedido = await crearPedidoDeliveryDesdeConversacion({
  telefono,
  conv,
  medioPago: 'efectivo',
  deliveryConfig,
  restaurantId,
});

        await updateConversation(conv.id, {
          estado: deliveryConfig.efectivo_requiere_aprobacion
            ? 'esperando_aprobacion_efectivo'
            : 'pedido_registrado',
          medio_pago: 'efectivo',
          carrito: [],
        });

        const envioText =
          deliveryConfig.costo_envio > 0
            ? `\nEnvío: $${deliveryConfig.costo_envio}`
            : '';

        const cierre = deliveryConfig.efectivo_requiere_aprobacion
          ? 'Quedó pendiente de validación en efectivo. En cuanto lo aprueben, entra a cocina.'
          : 'Tu pedido ya quedó confirmado y pasó a preparación.';

        await reply(
          telefono,
          `Tu pedido ${pedido.codigo_publico} quedó registrado.\nCliente: ${conv.nombre_cliente ?? 'Sin nombre'}\nDirección: ${conv.direccion ?? 'Sin dirección'}${envioText}\n\n${cierre}`,
          connection
        );
      } catch (error) {
        console.error(error);
        await reply(
          telefono,
          'No pude registrar tu pedido en este momento. Probá nuevamente en unos minutos.',
          connection
        );
      }
      return;
    }

    await reply(
      telefono,
      buildPaymentOptionsMessage(deliveryConfig),
      connection
    );
    return;
  }

  if (conv.estado === 'esperando_aprobacion_efectivo') {
    await reply(
      telefono,
      'Tu pedido ya quedó registrado y está esperando aprobación del efectivo.',
      connection
    );
    return;
  }

  if (conv.estado === 'esperando_pago') {
    if (text.includes('link') || text.includes('pago')) {
      try {
        const pedido = await getLatestPendingMercadoPagoOrderByPhone(telefono);

        if (!pedido) {
          await reply(
            telefono,
            'No encontré un pedido pendiente de pago para reenviar el link.',
            connection
          );
          return;
        }

        const preferencia = await crearPreferenciaMercadoPago({
          pedido,
          conv,
        });

        await reply(
          telefono,
          `Acá tenés nuevamente el link de pago de tu pedido ${pedido.codigo_publico}:\n${preferencia.paymentUrl}`,
          connection
        );
      } catch (error) {
        console.error(error);
        await reply(
          telefono,
          'No pude reenviar el link de pago en este momento. Probá nuevamente en unos minutos.',
          connection
        );
      }
      return;
    }

    await reply(
      telefono,
      'Tu pedido ya quedó registrado. Si ya pagaste, aguardá la confirmación. Si todavía no pagaste, escribime "link" y te lo reenvío.',
      connection
    );
    return;
  }

  if (conv.estado === 'pedido_registrado') {
    await reply(
      telefono,
      'Tu pedido ya quedó registrado. En unos minutos te avisamos si hay alguna novedad.',
      connection
    );
    return;
  }

  await updateConversation(conv.id, { estado: 'inicio' });

  await reply(
    telefono,
    'Escribime "hola" o "menu" y arrancamos el pedido de delivery.',
    connection
  );
}