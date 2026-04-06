import { supabase } from '@/lib/supabaseClient';
import { sendWhatsAppText } from './whatsapp';

const DELIVERY_MESA_ID = 0;

type DeliveryCartItem = {
  producto_id: number;
  nombre: string;
  precio: number;
  cantidad: number;
};

type DeliveryConversation = {
  id: number;
  telefono: string;
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

function normalizeText(text: string) {
  return text.trim().toLowerCase();
}

function parseQuantityAndProduct(text: string) {
  const match = text.match(/^(\d+)\s*x\s*(.+)$/i);
  if (!match) return null;

  return {
    cantidad: Number(match[1]),
    nombre: match[2].trim().toLowerCase(),
  };
}

function buildDeliveryPublicCode(pedidoId: number) {
  return `DEL-${String(pedidoId).padStart(6, '0')}`;
}

function calcularTotal(carrito: DeliveryCartItem[]) {
  return carrito.reduce((acc, item) => {
    return acc + Number(item.precio ?? 0) * Number(item.cantidad ?? 0);
  }, 0);
}

function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    ''
  );
}

async function getConversation(telefono: string) {
  const { data } = await supabase
    .from('delivery_conversaciones')
    .select('*')
    .eq('telefono', telefono)
    .maybeSingle();

  if (data) return data as DeliveryConversation;

  const inserted = await supabase
    .from('delivery_conversaciones')
    .insert({
      telefono,
      estado: 'inicio',
      carrito: [],
    })
    .select('*')
    .single();

  return inserted.data as DeliveryConversation;
}

async function updateConversation(id: number, patch: Record<string, unknown>) {
  await supabase
    .from('delivery_conversaciones')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
}

async function findProductByName(name: string) {
  const { data } = await supabase
    .from('productos')
    .select('id, nombre, precio, disponible')
    .ilike('nombre', `%${name}%`)
    .eq('disponible', true)
    .limit(1)
    .maybeSingle();

  return data;
}

async function listAvailableProducts() {
  const { data } = await supabase
    .from('productos')
    .select('id, nombre, precio')
    .eq('disponible', true)
    .order('id', { ascending: true });

  return data ?? [];
}

async function crearPedidoDeliveryDesdeConversacion(params: {
  telefono: string;
  conv: DeliveryConversation;
  medioPago: 'efectivo' | 'mercadopago';
}): Promise<PedidoDeliveryCreado> {
  const { telefono, conv, medioPago } = params;

  const carrito = Array.isArray(conv.carrito) ? conv.carrito : [];
  if (carrito.length === 0) {
    throw new Error('El carrito está vacío.');
  }

  const total = calcularTotal(carrito);
  const esEfectivo = medioPago === 'efectivo';

  const payload = {
    mesa_id: DELIVERY_MESA_ID,
    estado: 'solicitado',
    total,
    paga_efectivo: esEfectivo,
    forma_pago: esEfectivo ? 'efectivo' : 'virtual',
    origen: 'delivery_whatsapp',
    tipo_servicio: 'delivery',
    cliente_nombre: conv.nombre_cliente?.trim() || null,
    cliente_telefono: telefono,
    direccion_entrega: conv.direccion?.trim() || null,
    medio_pago: esEfectivo ? 'efectivo' : 'mercadopago',
    estado_pago: esEfectivo ? 'esperando_aprobacion' : 'pendiente',
    efectivo_aprobado: false,
    codigo_publico: null,
  };

  const { data: pedido, error: errorPedido } = await supabase
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

  const { error: errorCodigo } = await supabase
    .from('pedidos')
    .update({ codigo_publico: codigoPublico })
    .eq('id', pedido.id);

  if (errorCodigo) {
    await supabase.from('pedidos').delete().eq('id', pedido.id);
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

  const { error: errorItems } = await supabase.from('items_pedido').insert(items);

  if (errorItems) {
    await supabase.from('pedidos').delete().eq('id', pedido.id);
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

export async function handleIncomingWhatsAppMessage(
  telefono: string,
  incomingText: string
) {
  const text = normalizeText(incomingText);
  const conv = await getConversation(telefono);

  if (text === 'hola' || text === 'menu' || conv.estado === 'inicio') {
    const products = await listAvailableProducts();
    const menuText = products
      .slice(0, 20)
      .map((p: any) => `- ${p.nombre} $${p.precio}`)
      .join('\n');

    await updateConversation(conv.id, { estado: 'armando_carrito' });

    await sendWhatsAppText(
      telefono,
      `¡Hola! 👋\nTe paso el menú:\n\n${menuText}\n\nPara agregar productos escribí por ejemplo:\n2 x hamburguesa\n1 x coca cola\n\nCuando termines, escribí: confirmar`
    );
    return;
  }

  if (conv.estado === 'armando_carrito') {
    if (text === 'confirmar') {
      const carrito = conv.carrito ?? [];

      if (!carrito.length) {
        await sendWhatsAppText(
          telefono,
          'Todavía no agregaste productos. Escribime por ejemplo: 2 x hamburguesa'
        );
        return;
      }

      await updateConversation(conv.id, { estado: 'pidiendo_nombre' });
      await sendWhatsAppText(
        telefono,
        'Perfecto. ¿A nombre de quién va el pedido?'
      );
      return;
    }

    const parsed = parseQuantityAndProduct(incomingText);

    if (!parsed) {
      await sendWhatsAppText(
        telefono,
        'No entendí ese formato. Probá así: 2 x hamburguesa'
      );
      return;
    }

    const product = await findProductByName(parsed.nombre);

    if (!product) {
      await sendWhatsAppText(
        telefono,
        `No encontré "${parsed.nombre}". Probá con otro nombre del menú.`
      );
      return;
    }

    const cart = Array.isArray(conv.carrito) ? conv.carrito : [];
    const nextCart = [
      ...cart,
      {
        producto_id: product.id,
        nombre: product.nombre,
        precio: Number(product.precio),
        cantidad: parsed.cantidad,
      },
    ];

    await updateConversation(conv.id, { carrito: nextCart });

    await sendWhatsAppText(
      telefono,
      `Agregado: ${parsed.cantidad} x ${product.nombre}\nEscribí otro producto o "confirmar".`
    );
    return;
  }

  if (conv.estado === 'pidiendo_nombre') {
    await updateConversation(conv.id, {
      estado: 'pidiendo_direccion',
      nombre_cliente: incomingText.trim(),
    });

    await sendWhatsAppText(
      telefono,
      'Pasame la dirección de entrega, por favor.'
    );
    return;
  }

  if (conv.estado === 'pidiendo_direccion') {
    await updateConversation(conv.id, {
      estado: 'pidiendo_pago',
      direccion: incomingText.trim(),
    });

    await sendWhatsAppText(
      telefono,
      '¿Cómo querés pagar?\n1) Mercado Pago\n2) Efectivo'
    );
    return;
  }

  if (conv.estado === 'pidiendo_pago') {
    if (text === '1' || text.includes('mercado')) {
      try {
        const pedido = await crearPedidoDeliveryDesdeConversacion({
          telefono,
          conv,
          medioPago: 'mercadopago',
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

        await sendWhatsAppText(
          telefono,
          `Tu pedido ${pedido.codigo_publico} quedó registrado.\nCliente: ${conv.nombre_cliente ?? 'Sin nombre'}\nDirección: ${conv.direccion ?? 'Sin dirección'}\n\nPagalo acá:\n${preferencia.paymentUrl}\n\nCuando Mercado Pago confirme el cobro, entra a cocina.`
        );
      } catch (error) {
        console.error(error);
        await sendWhatsAppText(
          telefono,
          'No pude registrar tu pedido o generar el link de pago en este momento. Probá nuevamente en unos minutos.'
        );
      }
      return;
    }

    if (text === '2' || text.includes('efectivo')) {
      try {
        const pedido = await crearPedidoDeliveryDesdeConversacion({
          telefono,
          conv,
          medioPago: 'efectivo',
        });

        await updateConversation(conv.id, {
          estado: 'esperando_aprobacion_efectivo',
          medio_pago: 'efectivo',
          carrito: [],
        });

        await sendWhatsAppText(
          telefono,
          `Tu pedido ${pedido.codigo_publico} quedó registrado.\nCliente: ${conv.nombre_cliente ?? 'Sin nombre'}\nDirección: ${conv.direccion ?? 'Sin dirección'}\n\nQuedó pendiente de validación en efectivo. En cuanto lo aprueben, entra a cocina.`
        );
      } catch (error) {
        console.error(error);
        await sendWhatsAppText(
          telefono,
          'No pude registrar tu pedido en este momento. Probá nuevamente en unos minutos.'
        );
      }
      return;
    }

    await sendWhatsAppText(
      telefono,
      'Respondé 1 para Mercado Pago o 2 para Efectivo.'
    );
    return;
  }

  if (conv.estado === 'esperando_aprobacion_efectivo') {
    await sendWhatsAppText(
      telefono,
      'Tu pedido ya quedó registrado y está esperando aprobación del efectivo.'
    );
    return;
  }

  if (conv.estado === 'esperando_pago') {
    await sendWhatsAppText(
      telefono,
      'Tu pedido ya quedó registrado. Si ya pagaste, aguardá la confirmación. Si todavía no pagaste, pedime nuevamente el link.'
    );
  }
}