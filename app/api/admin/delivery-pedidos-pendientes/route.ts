import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('pedidos')
      .select(
        `
          id,
          codigo_publico,
          creado_en,
          estado,
          total,
          origen,
          cliente_nombre,
          cliente_telefono,
          direccion_entrega,
          medio_pago,
          estado_pago,
          efectivo_aprobado
        `
      )
      .eq('medio_pago', 'efectivo')
      .or(
        [
          'origen.eq.delivery',
          'origen.eq.delivery_whatsapp',
          'origen.eq.delivery_manual',
        ].join(',')
      )
      .order('creado_en', { ascending: false });

    if (error) {
      return NextResponse.json(
        {
          error: `No se pudieron leer los pedidos pendientes: ${error.message}`,
        },
        { status: 500 }
      );
    }

    const pendientes = (data ?? []).filter((pedido) => {
      const estado = String(pedido.estado ?? '').toLowerCase();
      const estadoPago = String(pedido.estado_pago ?? '').toLowerCase();
      const efectivoAprobado = !!pedido.efectivo_aprobado;

      if (estado === 'cancelado' || estado === 'entregado') return false;

      if (estadoPago === 'esperando_aprobacion') return true;
      if (estadoPago === 'pendiente' && !efectivoAprobado) return true;

      return false;
    });

    return NextResponse.json({ pedidos: pendientes }, { status: 200 });
  } catch (error) {
    console.error('GET /api/admin/delivery-pedidos-pendientes', error);

    return NextResponse.json(
      {
        error: 'Ocurrió un error inesperado al leer los pedidos pendientes.',
      },
      { status: 500 }
    );
  }
}