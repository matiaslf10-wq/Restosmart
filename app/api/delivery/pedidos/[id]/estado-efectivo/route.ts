import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdminAuth } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DELIVERY_ORIGINS = ['delivery', 'delivery_whatsapp', 'delivery_manual'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { id } = await params;
    const pedidoId = Number(id);

    if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
      return NextResponse.json(
        { error: 'ID de pedido inválido.' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const accion = String(body?.accion ?? '').toLowerCase();

    if (accion !== 'aprobar' && accion !== 'rechazar') {
      return NextResponse.json(
        { error: 'La acción debe ser "aprobar" o "rechazar".' },
        { status: 400 }
      );
    }

    const current = await supabaseAdmin
      .from('pedidos')
      .select(
        `
          id,
          estado,
          origen,
          tipo_servicio,
          medio_pago,
          estado_pago,
          efectivo_aprobado
        `
      )
      .eq('id', pedidoId)
      .maybeSingle();

    if (current.error) {
      return NextResponse.json(
        {
          error: `No se pudo leer el pedido: ${current.error.message}`,
        },
        { status: 500 }
      );
    }

    if (!current.data) {
      return NextResponse.json(
        { error: 'No se encontró el pedido.' },
        { status: 404 }
      );
    }

    const pedido = current.data;
    const origen = String(pedido.origen ?? '').toLowerCase();
    const tipoServicio = String(pedido.tipo_servicio ?? '').toLowerCase();
    const medioPago = String(pedido.medio_pago ?? '').toLowerCase();
    const estado = String(pedido.estado ?? '').toLowerCase();
    const estadoPago = String(pedido.estado_pago ?? '').toLowerCase();

    const esDelivery =
      DELIVERY_ORIGINS.includes(origen) || tipoServicio === 'delivery';

    if (!esDelivery) {
      return NextResponse.json(
        { error: 'El pedido indicado no corresponde a delivery.' },
        { status: 400 }
      );
    }

    if (medioPago !== 'efectivo') {
      return NextResponse.json(
        { error: 'Solo se puede validar efectivo en pedidos en efectivo.' },
        { status: 400 }
      );
    }

    if (estado === 'cancelado' || estado === 'entregado') {
      return NextResponse.json(
        { error: 'Ese pedido ya no puede modificarse.' },
        { status: 400 }
      );
    }

    if (accion === 'aprobar' && (estadoPago === 'aprobado' || pedido.efectivo_aprobado)) {
      return NextResponse.json(
        { error: 'El efectivo de este pedido ya fue aprobado.' },
        { status: 400 }
      );
    }

    if (accion === 'rechazar' && estadoPago === 'rechazado') {
      return NextResponse.json(
        { error: 'El efectivo de este pedido ya fue rechazado.' },
        { status: 400 }
      );
    }

    const payload =
      accion === 'aprobar'
        ? {
            estado_pago: 'aprobado',
            efectivo_aprobado: true,
            estado: 'pendiente',
          }
        : {
            estado_pago: 'rechazado',
            efectivo_aprobado: false,
            estado: 'cancelado',
          };

    const { data, error } = await supabaseAdmin
      .from('pedidos')
      .update(payload)
      .eq('id', pedidoId)
      .select(
        `
          id,
          estado,
          estado_pago,
          efectivo_aprobado
        `
      )
      .single();

    if (error) {
      return NextResponse.json(
        {
          error: `No se pudo actualizar el pedido: ${error.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        pedido: data,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('POST /api/delivery/pedidos/[id]/estado-efectivo', error);

    return NextResponse.json(
      {
        error: 'Ocurrió un error inesperado al actualizar el pedido.',
      },
      { status: 500 }
    );
  }
}