import { supabase } from '@/lib/supabaseClient';
import { sendWhatsAppText } from './whatsapp';

function normalizeText(text: string) {
  return text.trim().toLowerCase();
}

function parseQuantityAndProduct(text: string) {
  // ejemplo simple: "2 x hamburguesa"
  const match = text.match(/^(\d+)\s*x\s*(.+)$/i);
  if (!match) return null;

  return {
    cantidad: Number(match[1]),
    nombre: match[2].trim().toLowerCase(),
  };
}

async function getConversation(telefono: string) {
  const { data } = await supabase
    .from('delivery_conversaciones')
    .select('*')
    .eq('telefono', telefono)
    .maybeSingle();

  if (data) return data;

  const inserted = await supabase
    .from('delivery_conversaciones')
    .insert({
      telefono,
      estado: 'inicio',
      carrito: [],
    })
    .select('*')
    .single();

  return inserted.data;
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
      await sendWhatsAppText(telefono, 'Perfecto. ¿A nombre de quién va el pedido?');
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

    await sendWhatsAppText(telefono, 'Pasame la dirección de entrega, por favor.');
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
      await updateConversation(conv.id, {
        estado: 'esperando_pago',
        medio_pago: 'mercadopago',
      });

      // acá crearías el pedido + payment intent + link
      await sendWhatsAppText(
        telefono,
        'Te genero el link de pago. Apenas se confirme, mandamos tu pedido a cocina.'
      );
      return;
    }

    if (text === '2' || text.includes('efectivo')) {
      await updateConversation(conv.id, {
        estado: 'esperando_aprobacion_efectivo',
        medio_pago: 'efectivo',
      });

      // acá crearías el pedido pendiente de aprobación
      await sendWhatsAppText(
        telefono,
        'Tu pedido quedó pendiente de validación en efectivo. En cuanto lo aprueben, entra a cocina.'
      );
      return;
    }

    await sendWhatsAppText(
      telefono,
      'Respondé 1 para Mercado Pago o 2 para Efectivo.'
    );
  }
}