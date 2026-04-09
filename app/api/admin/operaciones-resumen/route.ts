import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdminAuth } from '@/lib/adminAuth';
import { getRestaurantContext } from '@/lib/tenant';

export const runtime = 'nodejs';
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

type PedidoCanal = 'restaurant' | 'takeaway' | 'delivery';

function normalizeText(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}

function esDelivery(pedido: PedidoRow) {
  const tipoServicio = normalizeText(pedido.tipo_servicio);
  const origen = normalizeText(pedido.origen);

  return (
    tipoServicio === 'delivery' ||
    tipoServicio === 'envio' ||
    origen === 'delivery' ||
    origen === 'delivery_whatsapp' ||
    origen === 'delivery_manual'
  );
}

function esTakeaway(pedido: PedidoRow) {
  const tipoServicio = normalizeText(pedido.tipo_servicio);
  const origen = normalizeText(pedido.origen);

  return (
    tipoServicio === 'takeaway' ||
    tipoServicio === 'take_away' ||
    tipoServicio === 'pickup' ||
    tipoServicio === 'pick_up' ||
    tipoServicio === 'retiro' ||
    origen === 'takeaway' ||
    origen === 'takeaway_web' ||
    origen === 'takeaway_manual' ||
    origen === 'pickup' ||
    origen === 'retiro'
  );
}

function getPedidoCanal(pedido: PedidoRow): PedidoCanal {
  if (esDelivery(pedido)) return 'delivery';
  if (esTakeaway(pedido)) return 'takeaway';

  if (pedido.mesa_id === DELIVERY_MESA_ID) {
    return 'delivery';
  }

  return 'restaurant';
}

function esOperacionLocal(pedido: PedidoRow) {
  return getPedidoCanal(pedido) !== 'delivery';
}

function esPendienteAprobacionEfectivo(pedido: PedidoRow) {
  return (
    getPedidoCanal(pedido) === 'delivery' &&
    pedido.medio_pago === 'efectivo' &&
    !pedido.efectivo_aprobado &&
    (pedido.estado_pago === 'esperando_aprobacion' ||
      pedido.estado_pago === 'pendiente')
  );
}

function getMesaDisplay(mesa: MesaRow | undefined, pedido: PedidoRow) {
  const canal = getPedidoCanal(pedido);

  if (canal === 'delivery') return 'Delivery';
  if (canal === 'takeaway') return 'Retiro / mostrador';

  if (!mesa) return 'Mesa';
  if (mesa.id === DELIVERY_MESA_ID) return 'Delivery';
  if (mesa.numero != null && mesa.numero > 0) return `Mesa ${mesa.numero}`;
  return mesa.nombre || 'Mesa';
}

export async function GET(request: NextRequest) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const restaurant = await getRestaurantContext().catch(() => null);

    const [mesasResult, pedidosResult, alertasResult] = await Promise.all([
      supabaseAdmin
        .from('mesas')
        .select('id, numero, nombre')
        .order('id', { ascending: true }),
      supabaseAdmin
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
      supabaseAdmin
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

    const operacionLocalPedidos = pedidos
      .filter((pedido) => esOperacionLocal(pedido))
      .map((pedido) => {
        const canal = getPedidoCanal(pedido);

        return {
          ...pedido,
          operacion_canal: canal,
          mesa_nombre:
            pedido.mesa_id != null
              ? getMesaDisplay(mesasMap.get(pedido.mesa_id), pedido)
              : getMesaDisplay(undefined, pedido),
        };
      })
      .slice(0, 20);

    const deliveryPedidos = pedidos
      .filter((pedido) => getPedidoCanal(pedido) === 'delivery')
      .map((pedido) => ({
        ...pedido,
        operacion_canal: 'delivery' as const,
        mesa_nombre: 'Delivery',
      }))
      .slice(0, 20);

    const localRestaurantPedidos = operacionLocalPedidos.filter(
      (p) => p.operacion_canal === 'restaurant'
    );
    const localTakeawayPedidos = operacionLocalPedidos.filter(
      (p) => p.operacion_canal === 'takeaway'
    );

    const resumen = {
      salonSolicitados: operacionLocalPedidos.filter((p) => p.estado === 'solicitado')
        .length,
      salonEnCurso: operacionLocalPedidos.filter(
        (p) => p.estado === 'pendiente' || p.estado === 'en_preparacion'
      ).length,
      salonListos: operacionLocalPedidos.filter((p) => p.estado === 'listo').length,
      deliveryPendientesAprobacion: deliveryPedidos.filter((p) =>
        esPendienteAprobacionEfectivo(p)
      ).length,
      deliveryActivos: deliveryPedidos.length,
      alertasWhatsAppAbiertas: alertas.length,
      localRestaurantActivos: localRestaurantPedidos.length,
      localTakeawayActivos: localTakeawayPedidos.length,
      localRestaurantSolicitados: localRestaurantPedidos.filter(
        (p) => p.estado === 'solicitado'
      ).length,
      localRestaurantEnCurso: localRestaurantPedidos.filter(
        (p) => p.estado === 'pendiente' || p.estado === 'en_preparacion'
      ).length,
      localRestaurantListos: localRestaurantPedidos.filter(
        (p) => p.estado === 'listo'
      ).length,
      localTakeawaySolicitados: localTakeawayPedidos.filter(
        (p) => p.estado === 'solicitado'
      ).length,
      localTakeawayEnCurso: localTakeawayPedidos.filter(
        (p) => p.estado === 'pendiente' || p.estado === 'en_preparacion'
      ).length,
      localTakeawayListos: localTakeawayPedidos.filter(
        (p) => p.estado === 'listo'
      ).length,
    };

    return NextResponse.json(
      {
        resumen,
        salonPedidos: operacionLocalPedidos,
        deliveryPedidos,
        whatsappAlertas: alertas,
        meta: {
          alertasDisponibles: !alertasError,
          restaurant: restaurant
            ? {
                id: restaurant.id,
                slug: restaurant.slug,
                plan: restaurant.plan ?? null,
              }
            : null,
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