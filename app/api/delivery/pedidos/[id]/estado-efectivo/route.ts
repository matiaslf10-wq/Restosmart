import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pedidoId = Number(id);

    if (!Number.isFinite(pedidoId)) {
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

    const { data, error } = await supabase
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