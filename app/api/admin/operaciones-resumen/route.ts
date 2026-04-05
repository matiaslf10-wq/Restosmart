import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

const DELIVERY_MESA_ID = 0;

type MesaRow = {
  id: number;
  numero: number | null;
  nombre: string;
};

type PedidoRow = {
  id: number;
  codigo_publico?: string | null;
  mesa_id: number | null;
  creado_en: string;
  estado: string;
  total: number | string | null;
  origen?: string | null;
  tipo_servicio?: string | null;
  cliente_nombre?: string | null;
  cliente_telefono?: string | null;
  direccion_entrega?: string | null;
  medio_pago?: string | null;
  estado_pago?: string | null;
  efectivo_aprobado?: boolean | null;
};

type WhatsappAlertRow = {
  id: number;
  telefono: string | null;
  pedido_id: number | null;
  motivo: string;
  mensaje: string;
  prioridad: string;
  requiere_atencion_humana: boolean;
  resuelta: boolean;
  created_at: string;
};

function esDelivery(pedido: PedidoRow) {
  return (
    pedido.mesa_id === DELIVERY_MESA_ID ||
    pedido.tipo_servicio === 'delivery' ||
    pedido.origen === 'delivery' ||
    pedido.origen === 'delivery_whatsapp' ||
    pedido.origen === 'delivery_manual'
  );
}

function esPendienteAprobacionEfectivo(pedido: PedidoRow) {
  return (
    esDelivery(pedido) &&
    pedido.medio_pago === 'efectivo' &&
    !pedido.efectivo_aprobado &&
    (pedido.estado_pago === 'esperando_aprobacion' ||
      pedido.estado_pago === 'pendiente')
  );
}

function getMesaDisplay(mesa: MesaRow | undefined) {
  if (!mesa) return 'Delivery';
  if (mesa.id === DELIVERY_MESA_ID) return 'Delivery';
  if (mesa.numero != null && mesa.numero > 0) return `Mesa ${mesa.numero}`;
  return mesa.nombre || 'Delivery';
}

export async function GET() {
  try {
    const [mesasResult, pedidosResult, alertasResult] = await Promise.all([
      supabase.from('mesas').select('id, numero, nombre').order('id', { ascending: true }),
      supabase
        .from('pedidos')
        .select(
          `
            id,
            codigo_publico,
            mesa_id,
            creado_en,
            estado,
            total,
            origen,
            tipo_servicio,
            cliente_nombre,
            cliente_telefono,
            direccion_entrega,
            medio_pago,
            estado_pago,
            efectivo_aprobado
          `
        )
        .in('estado', ['solicitado', 'pendiente', 'en_preparacion', 'listo'])
        .order('creado_en', { ascending: false }),
      supabase
        .from('whatsapp_alertas')
        .select(
          `
            id,
            telefono,
            pedido_id,
            motivo,
            mensaje,
            prioridad,
            requiere_atencion_humana,
            resuelta,
            created_at
          `
        )
        .eq('resuelta', false)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (mesasResult.error) {
      return NextResponse.json(
        { error: `No se pudieron leer las mesas: ${mesasResult.error.message}` },
        { status: 500 }
      );
    }

    if (pedidosResult.error) {
      return NextResponse.json(
        { error: `No se pudieron leer los pedidos: ${pedidosResult.error.message}` },
        { status: 500 }
      );
    }

    const mesas = (mesasResult.data ?? []) as MesaRow[];
    const pedidos = (pedidosResult.data ?? []) as PedidoRow[];
    const alertasError = alertasResult.error;
    const alertas = alertasError
      ? []
      : ((alertasResult.data ?? []) as WhatsappAlertRow[]);

    const mesasMap = new Map<number, MesaRow>();
    mesas.forEach((mesa) => {
      mesasMap.set(mesa.id, mesa);
    });

    const salonPedidos = pedidos
      .filter((pedido) => !esDelivery(pedido))
      .map((pedido) => ({
        ...pedido,
        mesa_nombre: pedido.mesa_id ? getMesaDisplay(mesasMap.get(pedido.mesa_id)) : 'Mesa',
      }))
      .slice(0, 20);

    const deliveryPedidos = pedidos
      .filter((pedido) => esDelivery(pedido))
      .map((pedido) => ({
        ...pedido,
        mesa_nombre: 'Delivery',
      }))
      .slice(0, 20);

    const resumen = {
      salonSolicitados: salonPedidos.filter((p) => p.estado === 'solicitado').length,
      salonEnCurso: salonPedidos.filter(
        (p) => p.estado === 'pendiente' || p.estado === 'en_preparacion'
      ).length,
      salonListos: salonPedidos.filter((p) => p.estado === 'listo').length,
      deliveryPendientesAprobacion: deliveryPedidos.filter((p) =>
        esPendienteAprobacionEfectivo(p)
      ).length,
      deliveryActivos: deliveryPedidos.length,
      alertasWhatsAppAbiertas: alertas.length,
    };

    return NextResponse.json(
      {
        resumen,
        salonPedidos,
        deliveryPedidos,
        whatsappAlertas: alertas,
        meta: {
          alertasDisponibles: !alertasError,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET /api/admin/operaciones-resumen', error);

    return NextResponse.json(
      {
        error: 'Ocurrió un error inesperado al cargar el panel de operaciones.',
      },
      { status: 500 }
    );
  }
}