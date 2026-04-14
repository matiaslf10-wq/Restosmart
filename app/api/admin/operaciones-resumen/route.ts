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
type EstadoMesaSalon = 'en_curso' | 'lista_para_caja';

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
    origen === 'delivery_manual' ||
    pedido.mesa_id === DELIVERY_MESA_ID
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
    origen === 'takeaway_manual_mostrador' ||
    origen === 'pickup' ||
    origen === 'retiro'
  );
}

function getPedidoCanal(pedido: PedidoRow): PedidoCanal {
  if (esDelivery(pedido)) return 'delivery';
  if (esTakeaway(pedido)) return 'takeaway';
  return 'restaurant';
}

function esOperacionLocal(pedido: PedidoRow) {
  return getPedidoCanal(pedido) !== 'delivery';
}

function esPendienteAprobacionEfectivo(pedido: PedidoRow) {
  return (
    getPedidoCanal(pedido) === 'delivery' &&
    normalizeText(pedido.medio_pago) === 'efectivo' &&
    !pedido.efectivo_aprobado &&
    (normalizeText(pedido.estado_pago) === 'esperando_aprobacion' ||
      normalizeText(pedido.estado_pago) === 'pendiente')
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

function getEstadoMesaSalon(pedidosMesa: PedidoRow[]): EstadoMesaSalon {
  const hayEnCurso = pedidosMesa.some((pedido) => {
    const estado = normalizeText(pedido.estado);
    return (
      estado === 'solicitado' ||
      estado === 'pendiente' ||
      estado === 'en_preparacion'
    );
  });

  if (hayEnCurso) return 'en_curso';
  return 'lista_para_caja';
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

    const pedidosConCanal = pedidos.map((pedido) => {
      const canal = getPedidoCanal(pedido);

      return {
        ...pedido,
        operacion_canal: canal,
        mesa_nombre:
          pedido.mesa_id != null
            ? getMesaDisplay(mesasMap.get(pedido.mesa_id), pedido)
            : getMesaDisplay(undefined, pedido),
      };
    });

    const localPedidos = pedidosConCanal
      .filter((pedido) => esOperacionLocal(pedido))
      .slice(0, 20);

    const restaurantPedidos = pedidosConCanal
      .filter((pedido) => pedido.operacion_canal === 'restaurant')
      .slice(0, 20);

    const takeawayPedidos = pedidosConCanal
      .filter((pedido) => pedido.operacion_canal === 'takeaway')
      .slice(0, 20);

    const deliveryPedidos = pedidosConCanal
      .filter((pedido) => pedido.operacion_canal === 'delivery')
      .map((pedido) => ({
        ...pedido,
        mesa_nombre: 'Delivery',
      }))
      .slice(0, 20);

    const restaurantPedidosFull = pedidosConCanal.filter(
      (pedido) => pedido.operacion_canal === 'restaurant'
    );
    const takeawayPedidosFull = pedidosConCanal.filter(
      (pedido) => pedido.operacion_canal === 'takeaway'
    );
    const deliveryPedidosFull = pedidosConCanal.filter(
      (pedido) => pedido.operacion_canal === 'delivery'
    );

    const salonMesasMap = new Map<
      number,
      {
        mesa_id: number;
        mesa_nombre: string;
        mesa_numero: number | null;
        pedidos: typeof restaurantPedidosFull;
        total: number;
      }
    >();

    for (const pedido of restaurantPedidosFull) {
      if (pedido.mesa_id == null) continue;

      const mesaRef = mesasMap.get(pedido.mesa_id);
      const mesaNombre = getMesaDisplay(mesaRef, pedido);

      if (!salonMesasMap.has(pedido.mesa_id)) {
        salonMesasMap.set(pedido.mesa_id, {
          mesa_id: pedido.mesa_id,
          mesa_nombre: mesaNombre,
          mesa_numero: mesaRef?.numero ?? null,
          pedidos: [],
          total: 0,
        });
      }

      const bucket = salonMesasMap.get(pedido.mesa_id)!;
      bucket.pedidos.push(pedido);
      bucket.total += Number(pedido.total ?? 0);
    }

    const salonMesas = Array.from(salonMesasMap.values())
      .map((mesa) => ({
        mesa_id: mesa.mesa_id,
        mesa_nombre: mesa.mesa_nombre,
        mesa_numero: mesa.mesa_numero,
        estado_mesa: getEstadoMesaSalon(mesa.pedidos),
        pedidos_activos: mesa.pedidos.length,
        total: mesa.total,
        pedidos: mesa.pedidos,
      }))
      .sort((a, b) => {
        const aNumero =
          typeof a.mesa_numero === 'number' && a.mesa_numero > 0
            ? a.mesa_numero
            : Number.MAX_SAFE_INTEGER;
        const bNumero =
          typeof b.mesa_numero === 'number' && b.mesa_numero > 0
            ? b.mesa_numero
            : Number.MAX_SAFE_INTEGER;

        if (aNumero !== bNumero) return aNumero - bNumero;
        return a.mesa_id - b.mesa_id;
      });

    const resumen = {
      salonSolicitados: restaurantPedidosFull.filter(
        (p) => normalizeText(p.estado) === 'solicitado'
      ).length,
      salonEnCurso: restaurantPedidosFull.filter((p) => {
        const estado = normalizeText(p.estado);
        return estado === 'pendiente' || estado === 'en_preparacion';
      }).length,
      salonListos: restaurantPedidosFull.filter(
        (p) => normalizeText(p.estado) === 'listo'
      ).length,

      localSolicitados: pedidosConCanal.filter((p) => {
        return esOperacionLocal(p) && normalizeText(p.estado) === 'solicitado';
      }).length,
      localEnCurso: pedidosConCanal.filter((p) => {
        const estado = normalizeText(p.estado);
        return (
          esOperacionLocal(p) &&
          (estado === 'pendiente' || estado === 'en_preparacion')
        );
      }).length,
      localListos: pedidosConCanal.filter((p) => {
        return esOperacionLocal(p) && normalizeText(p.estado) === 'listo';
      }).length,

      deliveryPendientesAprobacion: deliveryPedidosFull.filter((p) =>
        esPendienteAprobacionEfectivo(p)
      ).length,
      deliveryActivos: deliveryPedidosFull.length,
      alertasWhatsAppAbiertas: alertas.length,

      localRestaurantActivos: restaurantPedidosFull.length,
      localTakeawayActivos: takeawayPedidosFull.length,

      localRestaurantSolicitados: restaurantPedidosFull.filter(
        (p) => normalizeText(p.estado) === 'solicitado'
      ).length,
      localRestaurantEnCurso: restaurantPedidosFull.filter((p) => {
        const estado = normalizeText(p.estado);
        return estado === 'pendiente' || estado === 'en_preparacion';
      }).length,
      localRestaurantListos: restaurantPedidosFull.filter(
        (p) => normalizeText(p.estado) === 'listo'
      ).length,

      localTakeawaySolicitados: takeawayPedidosFull.filter(
        (p) => normalizeText(p.estado) === 'solicitado'
      ).length,
      localTakeawayEnCurso: takeawayPedidosFull.filter((p) => {
        const estado = normalizeText(p.estado);
        return estado === 'pendiente' || estado === 'en_preparacion';
      }).length,
      localTakeawayListos: takeawayPedidosFull.filter(
        (p) => normalizeText(p.estado) === 'listo'
      ).length,

      salonMesasActivas: salonMesas.length,
      salonMesasEnCurso: salonMesas.filter(
        (mesa) => mesa.estado_mesa === 'en_curso'
      ).length,
      salonMesasListasParaCaja: salonMesas.filter(
        (mesa) => mesa.estado_mesa === 'lista_para_caja'
      ).length,
    };

    return NextResponse.json(
      {
        resumen,
        salonPedidos: restaurantPedidos,
        takeawayPedidos,
        localPedidos,
        salonMesas: salonMesas.slice(0, 20),
        deliveryPedidos,
        whatsappAlertas: alertas,
        meta: {
          alertasDisponibles: !alertasError,
          operation_identity:
            takeawayPedidosFull.length > 0 && restaurantPedidosFull.length === 0
              ? 'persona'
              : 'mesa',
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