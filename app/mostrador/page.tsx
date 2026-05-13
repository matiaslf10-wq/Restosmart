'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
  formatBusinessModeLabel,
  formatPlanLabel,
  normalizeBusinessMode,
  type BusinessMode,
  type PlanCode,
} from '@/lib/plans';

const DELIVERY_MESA_ID = 0;
const NEW_PEDIDO_HIGHLIGHT_MS = 45000;

type KitchenPrepState = 'pendiente' | 'en_preparacion' | 'listo';
type PrepTarget = 'mostrador' | 'cocina';

type ItemPedido = {
  id: number;
  cantidad: number;
  comentarios: string | null;
  comentarioVisible: string | null;
  prepTarget: PrepTarget;
  kitchenState: KitchenPrepState | null;
  producto: {
    id?: number | null;
    nombre: string;
    precio?: number | null;
    marca_id?: string | null;
  } | null;
};

type Pedido = {
  id: number;
    restaurant_id?: string | number | null;
  mesa_id: number;
  creado_en: string;
  estado: string;
  total: number | string | null;
  codigo_publico?: string | null;
  origen?: string | null;
  tipo_servicio?: string | null;
  cliente_nombre?: string | null;
  medio_pago?: string | null;
  estado_pago?: string | null;
  forma_pago?: 'efectivo' | 'virtual' | null;
  paga_efectivo?: boolean | null;
  efectivo_aprobado?: boolean | null;
  pasado_a_caja?: boolean | null;
  items: ItemPedido[];
};

type MesaRef = {
  id: number;
  numero: number | null;
  nombre: string | null;
  restaurant_id?: string | number | null;
};

type Producto = {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  categoria: string | null;
  imagen_url?: string | null;
  disponible?: boolean | null;
  control_stock?: boolean | null;
  stock_actual?: number | null;
  permitir_sin_stock?: boolean | null;
  marca_id?: string | null;
};

type Marca = {
  id: string;
  nombre: string;
  descripcion: string | null;
  logo_url?: string | null;
  color_hex?: string | null;
  activa: boolean | null;
  orden: number | null;
};

type ItemCarrito = {
  producto: Producto;
  cantidad: number;
  comentarios: string;
  prepTarget: PrepTarget;
};

type PedidoKind = 'salon' | 'takeaway' | 'delivery';
type FormaPago = 'efectivo' | 'virtual';
type PrimaryMode = 'salon' | 'takeaway';

type AdminSessionPayload = {
  adminId?: string;
  plan?: PlanCode;
  business_mode?: BusinessMode;
  addons?: {
    multi_brand?: boolean;
  };
  capabilities?: {
    waiter_mode?: boolean;
    multi_brand?: boolean;
  };
  restaurant?: {
    business_mode?: BusinessMode;
  } | null;
};

type MesaActiva = {
  id: number;
  numero: number | null;
  nombre: string;
  pedidos: Pedido[];
  totalMesa: number;
  pasadaACaja: boolean;
};

type FiltroEstado = 'todos' | 'pendiente' | 'en_preparacion' | 'listo';

type ManualOrderMode = 'salon' | 'takeaway';

function formatMoney(value: number | string | null | undefined) {
  const num = Number(value ?? 0);

  if (!Number.isFinite(num)) return '$0';

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(num);
}

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function getStockDisponible(producto: Producto) {
  if (!producto.control_stock) return null;
  if (producto.permitir_sin_stock) return null;
  return Math.max(Number(producto.stock_actual ?? 0), 0);
}

function isProductoAgotado(producto: Producto) {
  const stockDisponible = getStockDisponible(producto);
  return stockDisponible !== null && stockDisponible <= 0;
}

function getMaxCantidadCarrito(producto: Producto) {
  const stockDisponible = getStockDisponible(producto);
  return stockDisponible === null ? Number.MAX_SAFE_INTEGER : stockDisponible;
}

function getStockMessage(producto: Producto) {
  if (!producto.control_stock) return null;
  if (producto.permitir_sin_stock) return 'Stock flexible';

  const stock = Math.max(Number(producto.stock_actual ?? 0), 0);

  if (stock <= 0) return 'Sin stock';
  if (stock <= 5) return `Disponibles: ${stock}`;

  return null;
}

function parseKitchenMeta(comment: string | null | undefined) {
  const raw = String(comment ?? '').trim();

  if (!raw) {
    return {
      prepTarget: 'mostrador' as PrepTarget,
      kitchenState: null as KitchenPrepState | null,
      comentarioVisible: null as string | null,
    };
  }

  const match = raw.match(
    /^\[\[COCINA:(pendiente|en_preparacion|listo)\]\]\s*(.*)$/i
  );

  if (!match) {
    return {
      prepTarget: 'mostrador' as PrepTarget,
      kitchenState: null,
      comentarioVisible: raw,
    };
  }

  const visible = String(match[2] ?? '').trim();

  return {
    prepTarget: 'cocina' as PrepTarget,
    kitchenState: match[1].toLowerCase() as KitchenPrepState,
    comentarioVisible: visible || null,
  };
}

function buildKitchenComment(
  comment: string | null | undefined,
  kitchenState: KitchenPrepState
) {
  const visible = String(comment ?? '').trim();
  return `[[COCINA:${kitchenState}]]${visible ? ` ${visible}` : ''}`;
}

function isDeliveryPedido(pedido: Pedido) {
  if (isTakeawayPedido(pedido)) return false;

  const tipo = normalizeText(pedido.tipo_servicio);
  const origen = normalizeText(pedido.origen);

  return (
    pedido.mesa_id === DELIVERY_MESA_ID ||
    tipo === 'delivery' ||
    tipo === 'envio' ||
    origen === 'delivery' ||
    origen === 'delivery_whatsapp' ||
    origen === 'delivery_manual'
  );
}

function isTakeawayPedido(pedido: Pedido) {
  const tipo = normalizeText(pedido.tipo_servicio);
  const origen = normalizeText(pedido.origen);

  return (
    tipo === 'takeaway' ||
    tipo === 'take_away' ||
    tipo === 'pickup' ||
    tipo === 'pick_up' ||
    tipo === 'retiro' ||
    origen === 'takeaway' ||
    origen === 'takeaway_web' ||
    origen === 'takeaway_manual' ||
    origen === 'takeaway_manual_mostrador' ||
    origen === 'pickup' ||
    origen === 'retiro'
  );
}

function getPedidoKind(pedido: Pedido): PedidoKind {
  if (isTakeawayPedido(pedido)) return 'takeaway';
  if (isDeliveryPedido(pedido)) return 'delivery';
  return 'salon';
}

function isMostradorManagedPedido(pedido: Pedido) {
  return normalizeText(pedido.origen).includes('mostrador');
}

function getMesaDisplayName(
  mesa: MesaActiva | { numero: number | null; nombre: string }
) {
  if (mesa.numero != null && mesa.numero > 0) {
    return `Mesa ${mesa.numero}`;
  }

  return mesa.nombre;
}

function getTakeawayLabel(pedido: Pedido) {
  const cliente = String(pedido.cliente_nombre ?? '').trim();
  return cliente || 'Cliente sin nombre';
}

function getPaymentBadge(pedido: Pedido) {
  const raw = normalizeText(
    pedido.medio_pago ??
      pedido.forma_pago ??
      (pedido.paga_efectivo ? 'efectivo' : '')
  );

  if (raw === 'efectivo') {
    return {
      label: '💵 Efectivo',
      className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    };
  }

  if (raw === 'virtual') {
    return {
      label: '💳 Virtual',
      className: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    };
  }

  return {
    label: 'Pago sin definir',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  };
}

function getEstadoBadgeClass(estado: string) {
  const normalized = normalizeText(estado);

  if (normalized === 'listo') {
    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  }

  if (normalized === 'en_preparacion') {
    return 'bg-sky-100 text-sky-800 border-sky-200';
  }

  if (normalized === 'pendiente' || normalized === 'solicitado') {
    return 'bg-amber-100 text-amber-800 border-amber-200';
  }

  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function formatEstadoLabel(estado: string) {
  const normalized = normalizeText(estado);

  if (normalized === 'solicitado') return 'Solicitado';
  if (normalized === 'pendiente') return 'Pendiente';
  if (normalized === 'en_preparacion') return 'En preparación';
  if (normalized === 'listo') return 'Listo';
  if (normalized === 'entregado') return 'Entregado';
  if (normalized === 'cerrado') return 'Cerrado';

  return estado || 'Sin estado';
}

function calcularEstadoMesa(mesa: MesaActiva) {
  if (mesa.pedidos.length === 0) return 'libre';

  const hayEnCurso = mesa.pedidos.some((p) => {
    const estado = getPedidoWorkflowState(p);
    return (
      estado === 'solicitado' ||
      estado === 'pendiente' ||
      estado === 'en_preparacion'
    );
  });

  if (hayEnCurso) return 'en_curso';

  return 'lista';
}

function getMesaEstadoBadge(estado: 'libre' | 'en_curso' | 'lista') {
  if (estado === 'lista') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-800">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Lista
      </span>
    );
  }

  if (estado === 'en_curso') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        En curso
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">
      <span className="h-2 w-2 rounded-full bg-slate-400" />
      Libre
    </span>
  );
}

function sortMesas(a: MesaRef, b: MesaRef) {
  const aNumero =
    typeof a.numero === 'number' && a.numero > 0
      ? a.numero
      : Number.MAX_SAFE_INTEGER;
  const bNumero =
    typeof b.numero === 'number' && b.numero > 0
      ? b.numero
      : Number.MAX_SAFE_INTEGER;

  if (aNumero !== bNumero) return aNumero - bNumero;
  return a.id - b.id;
}

function dedupeMesasForSelector(mesas: MesaRef[]) {
  const seen = new Set<string>();

  return mesas.filter((mesa) => {
    const nombre = normalizeText(mesa.nombre);
    const numero =
      typeof mesa.numero === 'number' && mesa.numero > 0 ? mesa.numero : null;

    let key = '';

    if (mesa.id === DELIVERY_MESA_ID || nombre === 'delivery') {
      key = 'delivery';
    } else if (numero != null) {
      key = `mesa:${numero}`;
    } else {
      const mesaDesdeNombre = nombre.match(/^mesa\s+(\d+)$/i);
      if (mesaDesdeNombre) {
        key = `mesa:${mesaDesdeNombre[1]}`;
      } else if (nombre) {
        key = `nombre:${nombre}`;
      } else {
        key = `id:${mesa.id}`;
      }
    }

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getKitchenItems(pedido: Pedido) {
  return pedido.items.filter((item) => item.prepTarget === 'cocina');
}

function hasKitchenPendingItems(pedido: Pedido) {
  return pedido.items.some(
    (item) => item.prepTarget === 'cocina' && item.kitchenState !== 'listo'
  );
}

function getPedidoWorkflowState(pedido: Pedido) {
  const pedidoEstado = normalizeText(pedido.estado);

  if (pedidoEstado === 'entregado' || pedidoEstado === 'cerrado') {
    return pedidoEstado;
  }

  const kitchenItems = getKitchenItems(pedido);

  if (kitchenItems.length === 0) {
    return pedidoEstado;
  }

  const hasKitchenPending = kitchenItems.some(
    (item) => item.kitchenState !== 'listo'
  );

  if (hasKitchenPending) {
    return 'en_preparacion';
  }

  return 'listo';
}

function matchesWorkflowFilter(pedido: Pedido, filtroEstado: FiltroEstado) {
  if (filtroEstado === 'todos') return true;

  return normalizeText(getPedidoWorkflowState(pedido)) === filtroEstado;
}

function MostradorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const focusMesaId = useMemo(() => {
    const raw = searchParams.get('focusMesaId');
    const parsed = Number(raw);

    if (!raw || !Number.isFinite(parsed) || parsed <= DELIVERY_MESA_ID) {
      return null;
    }

    return parsed;
  }, [searchParams]);

  const restaurantScopeQuery = useMemo(() => {
  const params = new URLSearchParams();

  params.set('scope', 'mostrador');

  const restaurantId =
    searchParams.get('restaurantId') ?? searchParams.get('restaurant_id');

  const restaurantSlug =
    searchParams.get('restaurantSlug') ??
    searchParams.get('restaurant') ??
    searchParams.get('slug');

  if (restaurantId) {
    params.set('restaurantId', restaurantId);
  } else if (restaurantSlug) {
    params.set('restaurantSlug', restaurantSlug);
  }

  return params.toString();
}, [searchParams]);

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [currentPlan, setCurrentPlan] = useState<PlanCode>('esencial');
  const [businessMode, setBusinessMode] = useState<BusinessMode>('restaurant');
  const [canUseWaiterMode, setCanUseWaiterMode] = useState(false);
  const [canUseMultiBrand, setCanUseMultiBrand] = useState(false);
  const [currentRestaurantId, setCurrentRestaurantId] = useState<
  string | number | null
>(null);
const [currentRestaurantLabel, setCurrentRestaurantLabel] = useState(
  'Sucursal no identificada'
);

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [mesasMap, setMesasMap] = useState<Record<number, MesaRef>>({});
  const [mesasList, setMesasList] = useState<MesaRef[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string | null>(null);

  const [manualMesaId, setManualMesaId] = useState<string>('');
  const [manualClienteNombre, setManualClienteNombre] = useState('');
  const [manualFormaPago, setManualFormaPago] = useState<FormaPago>('efectivo');
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [actualizandoPedidoId, setActualizandoPedidoId] = useState<number | null>(
    null
  );
  const [actualizandoItemId, setActualizandoItemId] = useState<number | null>(
    null
  );
  const [enviandoPedidoACocinaId, setEnviandoPedidoACocinaId] = useState<
    number | null
  >(null);
  const [cerrandoMesaId, setCerrandoMesaId] = useState<number | null>(null);
  const [creandoPedido, setCreandoPedido] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos');
  const [manualOrderMode, setManualOrderMode] = useState<ManualOrderMode>(
    businessMode === 'takeaway' ? 'takeaway' : 'salon'
  );
  const [compactMode, setCompactMode] = useState(true);
  const [recentlyArrivedPedidoIds, setRecentlyArrivedPedidoIds] = useState<number[]>(
    []
  );

  const newOrderAudioRef = useRef<HTMLAudioElement | null>(null);
  const knownPedidoIdsRef = useRef<Set<number>>(new Set());
  const didInitialPedidosLoadRef = useRef(false);
  const newPedidoTimeoutsRef = useRef<Record<number, ReturnType<typeof setTimeout>>>(
    {}
  );

  const marcarPedidosComoNuevos = useCallback((ids: number[]) => {
    if (ids.length === 0) return;

    setRecentlyArrivedPedidoIds((prev) =>
      Array.from(new Set([...ids, ...prev]))
    );

    ids.forEach((id) => {
      const previousTimeout = newPedidoTimeoutsRef.current[id];
      if (previousTimeout) {
        clearTimeout(previousTimeout);
      }

      newPedidoTimeoutsRef.current[id] = setTimeout(() => {
        setRecentlyArrivedPedidoIds((prev) =>
          prev.filter((currentId) => currentId !== id)
        );
        delete newPedidoTimeoutsRef.current[id];
      }, NEW_PEDIDO_HIGHLIGHT_MS);
    });
  }, []);

  const reproducirSonidoNuevoPedido = useCallback(async () => {
    const audio = newOrderAudioRef.current;
    if (!audio) return;

    try {
      audio.currentTime = 0;
      await audio.play();
    } catch (err) {
      console.error('No se pudo reproducir el sonido de nuevo pedido:', err);
    }
  }, []);

  useEffect(() => {
    return () => {
      Object.values(newPedidoTimeoutsRef.current).forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
    };
  }, []);

  useEffect(() => {
    const audio = new Audio('/sounds/mostrador.mp3');
    audio.preload = 'auto';
    newOrderAudioRef.current = audio;
  }, []);

  useEffect(() => {
    let active = true;

    async function verifyAccess() {
      try {
        const res = await fetch('/api/admin/session', {
  method: 'GET',
  cache: 'no-store',
  credentials: 'include',
});

        if (!res.ok) {
          router.replace('/admin/login');
          return;
        }

        const data = await res.json().catch(() => null);
        const session = (data?.session as AdminSessionPayload | null) ?? null;

        if (!active) return;

        if (!session?.adminId) {
          router.replace('/admin/login');
          return;
        }

        setCurrentPlan((session?.plan ?? 'esencial') as PlanCode);
setCanUseWaiterMode(!!session?.capabilities?.waiter_mode);
setCanUseMultiBrand(
  !!session?.capabilities?.multi_brand || !!session?.addons?.multi_brand
);
setBusinessMode(
  normalizeBusinessMode(
    session?.business_mode ?? session?.restaurant?.business_mode
  )
);
      } catch (err) {
        console.error('No se pudo verificar acceso a mostrador', err);
        if (!active) return;
        router.replace('/admin/login');
      } finally {
        if (active) {
          setCheckingAccess(false);
        }
      }
    }

    void verifyAccess();

    return () => {
      active = false;
    };
  }, [router]);

  const primaryMode: PrimaryMode =
    businessMode === 'takeaway' ? 'takeaway' : 'salon';

  const isRestaurantMode = primaryMode === 'salon';
  const isTakeawayMode = primaryMode === 'takeaway';

  const cargarDatos = useCallback(async () => {
  setCargando(true);
  setError(null);

  try {
    const pedidosPromise = fetch(`/api/pedidos?${restaurantScopeQuery}`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
    });

    const productosQuery = new URLSearchParams(restaurantScopeQuery);
productosQuery.set('soloDisponibles', '1');

const productosPromise = fetch(`/api/productos?${productosQuery.toString()}`, {
  method: 'GET',
  cache: 'no-store',
  credentials: 'include',
});

    const marcasPromise = canUseMultiBrand
      ? fetch('/api/admin/marcas', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'include',
        })
      : Promise.resolve(null);

    const [pedidosRes, productosRes, marcasRes] = await Promise.all([
      pedidosPromise,
      productosPromise,
      marcasPromise,
    ]);

    const pedidosBody = await pedidosRes.json().catch(() => null);

    if (!pedidosRes.ok) {
      console.error('Error cargando pedidos en mostrador por API:', {
        status: pedidosRes.status,
        body: pedidosBody,
      });

      setError(
        pedidosBody?.error || 'No se pudieron cargar los pedidos de mostrador.'
      );
      setPedidos([]);
      setMesasMap({});
      setMesasList([]);
    } else {
      const restaurantData = pedidosBody?.restaurant ?? null;
const restaurantId = restaurantData?.id ?? null;

const restaurantLabel = String(
  restaurantData?.nombre_local ??
    restaurantData?.slug ??
    (restaurantId != null ? `Sucursal ${restaurantId}` : 'Sucursal no identificada')
).trim();

setCurrentRestaurantId(restaurantId);
setCurrentRestaurantLabel(restaurantLabel || 'Sucursal no identificada');

      if (pedidosBody?.meta?.business_mode) {
        setBusinessMode(normalizeBusinessMode(pedidosBody.meta.business_mode));
      }

      const pedidosData = pedidosBody?.pedidos ?? [];

      const formateados: Pedido[] = ((pedidosData ?? []) as any[]).map((p) => ({
        id: p.id,
        restaurant_id: p.restaurant_id ?? null,
        mesa_id: p.mesa_id,
        creado_en: p.creado_en,
        estado: p.estado,
        total: p.total ?? 0,
        codigo_publico: p.codigo_publico ?? null,
        origen: p.origen ?? null,
        tipo_servicio: p.tipo_servicio ?? null,
        cliente_nombre: p.cliente_nombre ?? null,
        medio_pago: p.medio_pago ?? null,
        estado_pago: p.estado_pago ?? null,
        forma_pago: p.forma_pago ?? null,
        paga_efectivo: p.paga_efectivo ?? null,
        efectivo_aprobado: p.efectivo_aprobado ?? null,
        pasado_a_caja: p.pasado_a_caja ?? false,
        items: ((p.items_pedido ?? []) as any[]).map((item) => {
          const parsed = parseKitchenMeta(item.comentarios);

          return {
            id: item.id,
            cantidad: item.cantidad,
            comentarios: item.comentarios ?? null,
            comentarioVisible: parsed.comentarioVisible,
            prepTarget: parsed.prepTarget,
            kitchenState: parsed.kitchenState,
            producto: item.producto ?? null,
          };
        }),
      }));

      setPedidos(formateados);

      const currentIds = new Set(formateados.map((pedido) => pedido.id));

      if (!didInitialPedidosLoadRef.current) {
        knownPedidoIdsRef.current = currentIds;
        didInitialPedidosLoadRef.current = true;
      } else {
        const newIds = formateados
          .map((pedido) => pedido.id)
          .filter((id) => !knownPedidoIdsRef.current.has(id));

        if (newIds.length > 0) {
          marcarPedidosComoNuevos(newIds);
          void reproducirSonidoNuevoPedido();
        }

        knownPedidoIdsRef.current = currentIds;
      }

      const mesasTodas = ((pedidosBody?.mesas ?? []) as MesaRef[])
        .filter((mesa) => mesa.id >= DELIVERY_MESA_ID)
        .sort(sortMesas);

      const mesasParaSelector = dedupeMesasForSelector(mesasTodas);

      const map: Record<number, MesaRef> = {};
      for (const mesa of mesasTodas) {
        map[mesa.id] = mesa;
      }

      setMesasMap(map);
      setMesasList(mesasParaSelector);

      if (focusMesaId != null) {
        const mesaExiste = mesasParaSelector.some(
          (mesa) => mesa.id === focusMesaId
        );

        if (mesaExiste) {
          setManualMesaId(String(focusMesaId));
        }
      } else if (mesasParaSelector.length > 0 && !manualMesaId) {
        setManualMesaId(String(mesasParaSelector[0].id));
      }
    }

    const productosBody = await productosRes.json().catch(() => null);

    if (!productosRes.ok) {
      console.error('Error cargando productos en mostrador por API:', {
        status: productosRes.status,
        body: productosBody,
      });

      setError('No se pudieron cargar los productos para mostrador.');
      setProductos([]);
      setCategorias([]);
      setCategoriaSeleccionada(null);
    } else {
      const listaProductos = (productosBody ?? []) as Producto[];
      setProductos(listaProductos);

      const cats = Array.from(
        new Set(
          listaProductos
            .map((p) => p.categoria)
            .filter((c): c is string => !!c && c.trim() !== '')
        )
      ).sort((a, b) => a.localeCompare(b));

      setCategorias(cats);
      setCategoriaSeleccionada((prev) => {
        if (prev && cats.includes(prev)) return prev;
        return cats[0] ?? null;
      });

      if (!canUseMultiBrand) {
        setMarcas([]);
      } else if (marcasRes) {
        const marcasBody = await marcasRes.json().catch(() => null);

        if (!marcasRes.ok) {
          console.error('Error cargando marcas en mostrador:', {
            status: marcasRes.status,
            body: marcasBody,
          });
          setMarcas([]);
        } else {
          const marcasData = ((marcasBody?.marcas ?? []) as Marca[]).filter(
            (marca) => marca.activa !== false
          );

          setMarcas(marcasData);
        }
      }
    }
  } catch (err) {
    console.error('Error inesperado cargando mostrador:', err);
    setError('Ocurrió un error inesperado al cargar mostrador.');
  } finally {
    setCargando(false);
  }
}, [
  canUseMultiBrand,
  focusMesaId,
  manualMesaId,
  marcarPedidosComoNuevos,
  reproducirSonidoNuevoPedido,
  restaurantScopeQuery,
]);

  useEffect(() => {
    if (checkingAccess) return;

    void cargarDatos();

    const interval = setInterval(() => {
      void cargarDatos();
    }, 10000);

    return () => clearInterval(interval);
  }, [checkingAccess, cargarDatos]);

  useEffect(() => {
    if (isRestaurantMode && focusMesaId != null) {
      setManualOrderMode('salon');
      setManualMesaId(String(focusMesaId));
      return;
    }

    if (isRestaurantMode && !manualMesaId && mesasList.length > 0) {
      setManualMesaId(String(mesasList[0].id));
    }
  }, [focusMesaId, isRestaurantMode, manualMesaId, mesasList]);

  useEffect(() => {
    setManualOrderMode(businessMode === 'takeaway' ? 'takeaway' : 'salon');
  }, [businessMode]);

  useEffect(() => {
    setCarrito((prev) => {
      const next: ItemCarrito[] = [];

      for (const item of prev) {
        const productoActual = productos.find((p) => p.id === item.producto.id);

        if (!productoActual) continue;

        const maxCantidad = getMaxCantidadCarrito(productoActual);
        const cantidadNormalizada = Math.min(item.cantidad, maxCantidad);

        if (cantidadNormalizada <= 0) continue;

        next.push({
          ...item,
          producto: productoActual,
          cantidad: cantidadNormalizada,
        });
      }

      return next;
    });
  }, [productos]);

  const productosFiltrados =
    categoriaSeleccionada == null
      ? []
      : productos.filter((p) => p.categoria === categoriaSeleccionada);

  const totalCarrito = useMemo(
    () =>
      carrito.reduce(
        (acc, item) => acc + item.producto.precio * item.cantidad,
        0
      ),
    [carrito]
  );

  const recentPedidoIdsSet = useMemo(
    () => new Set(recentlyArrivedPedidoIds),
    [recentlyArrivedPedidoIds]
  );

  const marcasPorId = useMemo(() => {
  return new Map(marcas.map((marca) => [marca.id, marca]));
}, [marcas]);

function getMarcaProducto(producto: Producto | ItemPedido['producto'] | null | undefined) {
  if (!canUseMultiBrand) return null;

  const marcaId = producto?.marca_id ?? null;
  if (!marcaId) return null;

  return marcasPorId.get(marcaId) ?? null;
}

function renderMarcaBadge(
  producto: Producto | ItemPedido['producto'] | null | undefined
) {
  const marca = getMarcaProducto(producto);

  if (!marca) return null;

  const color = marca.color_hex?.trim() || '#64748b';

  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700">
      {marca.logo_url ? (
        <img
          src={marca.logo_url}
          alt={marca.nombre}
          className="h-3.5 w-3.5 rounded-full object-cover"
        />
      ) : (
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}

      <span className="truncate">{marca.nombre}</span>
    </span>
  );
}

  function agregarAlCarrito(producto: Producto) {
    setError(null);

    if (isProductoAgotado(producto)) {
      setError(`"${producto.nombre}" está sin stock.`);
      return;
    }

    setCarrito((prev) => {
      const existente = prev.find((i) => i.producto.id === producto.id);
      const maxCantidad = getMaxCantidadCarrito(producto);

      if (existente) {
        if (existente.cantidad >= maxCantidad) {
          setError(`No hay más stock disponible para "${producto.nombre}".`);
          return prev;
        }

        return prev.map((i) =>
          i.producto.id === producto.id
            ? { ...i, cantidad: i.cantidad + 1 }
            : i
        );
      }

      return [
        ...prev,
        {
          producto,
          cantidad: 1,
          comentarios: '',
          prepTarget: 'mostrador',
        },
      ];
    });
  }

  function cambiarCantidad(productoId: number, cantidad: number) {
    const itemActual = carrito.find((item) => item.producto.id === productoId);
    if (!itemActual) return;

    if (cantidad <= 0) {
      setCarrito((prev) => prev.filter((i) => i.producto.id !== productoId));
      return;
    }

    const maxCantidad = getMaxCantidadCarrito(itemActual.producto);
    const cantidadAjustada = Math.min(cantidad, maxCantidad);

    if (cantidadAjustada <= 0) {
      setError(`"${itemActual.producto.nombre}" está sin stock.`);
      setCarrito((prev) => prev.filter((i) => i.producto.id !== productoId));
      return;
    }

    if (cantidadAjustada !== cantidad) {
      setError(
        `Solo hay ${maxCantidad} unidad(es) disponible(s) de "${itemActual.producto.nombre}".`
      );
    } else {
      setError(null);
    }

    setCarrito((prev) =>
      prev.map((i) =>
        i.producto.id === productoId ? { ...i, cantidad: cantidadAjustada } : i
      )
    );
  }

  function cambiarComentario(productoId: number, texto: string) {
    setCarrito((prev) =>
      prev.map((i) =>
        i.producto.id === productoId ? { ...i, comentarios: texto } : i
      )
    );
  }

  function cambiarPrepTargetCarrito(productoId: number, prepTarget: PrepTarget) {
    setCarrito((prev) =>
      prev.map((i) =>
        i.producto.id === productoId ? { ...i, prepTarget } : i
      )
    );
  }

  const pedidosLocal = useMemo(
    () => pedidos.filter((pedido) => getPedidoKind(pedido) !== 'delivery'),
    [pedidos]
  );

  const takeawayPedidos = useMemo(
    () => pedidosLocal.filter((pedido) => getPedidoKind(pedido) === 'takeaway'),
    [pedidosLocal]
  );

  const mesasSalonActivas = useMemo<MesaActiva[]>(() => {
    const pedidosSalon = pedidosLocal.filter(
      (pedido) => getPedidoKind(pedido) === 'salon'
    );

    const grouped = new Map<number, Pedido[]>();

    for (const pedido of pedidosSalon) {
      if (!grouped.has(pedido.mesa_id)) {
        grouped.set(pedido.mesa_id, []);
      }

      grouped.get(pedido.mesa_id)!.push(pedido);
    }

    return Array.from(grouped.entries())
      .map(([mesaId, pedidosMesa]) => {
        const mesaRef = mesasMap[mesaId];

        const totalMesa = pedidosMesa.reduce(
          (acc, pedido) => acc + Number(pedido.total ?? 0),
          0
        );

        return {
  id: mesaId,
  numero: mesaRef?.numero ?? null,
  nombre: mesaRef?.nombre?.trim() || `Mesa ID ${mesaId}`,
  pedidos: pedidosMesa.sort((a, b) => {
    const timeA = new Date(a.creado_en).getTime();
    const timeB = new Date(b.creado_en).getTime();
    return timeA - timeB;
  }),
  totalMesa,
  pasadaACaja: pedidosMesa.some((pedido) => pedido.pasado_a_caja),
};
      })
      .sort((a, b) => {
  if (a.pasadaACaja && !b.pasadaACaja) return -1;
  if (!a.pasadaACaja && b.pasadaACaja) return 1;

  if (focusMesaId != null) {
    if (a.id === focusMesaId && b.id !== focusMesaId) return -1;
    if (b.id === focusMesaId && a.id !== focusMesaId) return 1;
  }

  const aNumero = a.numero ?? Number.MAX_SAFE_INTEGER;
  const bNumero = b.numero ?? Number.MAX_SAFE_INTEGER;

  if (aNumero !== bNumero) return aNumero - bNumero;
  return a.id - b.id;
});
  }, [focusMesaId, mesasMap, pedidosLocal]);

  const takeawayResumen = useMemo(() => {
    return takeawayPedidos.reduce(
      (acc, pedido) => {
        const estado = getPedidoWorkflowState(pedido);

        if (estado === 'listo') {
          acc.listos += 1;
        } else if (estado === 'en_preparacion') {
          acc.preparando += 1;
        } else {
          acc.pendientes += 1;
        }

        return acc;
      },
      { pendientes: 0, preparando: 0, listos: 0 }
    );
  }, [takeawayPedidos]);

  const salonResumen = useMemo(() => {
    return mesasSalonActivas.reduce(
      (acc, mesa) => {
        const estado = calcularEstadoMesa(mesa);

        if (estado === 'lista') {
          acc.listas += 1;
        } else if (estado === 'en_curso') {
          acc.enCurso += 1;
        }

        return acc;
      },
      { enCurso: 0, listas: 0 }
    );
  }, [mesasSalonActivas]);

  const takeawayPedidosFiltrados = useMemo(
    () =>
      takeawayPedidos.filter((pedido) =>
        matchesWorkflowFilter(pedido, filtroEstado)
      ),
    [takeawayPedidos, filtroEstado]
  );

  const mesasSalonFiltradas = useMemo(() => {
    const base =
      filtroEstado === 'todos'
        ? mesasSalonActivas
        : mesasSalonActivas.filter((mesa) =>
            mesa.pedidos.some((pedido) => matchesWorkflowFilter(pedido, filtroEstado))
          );

    if (focusMesaId == null) return base;

    return [...base].sort((a, b) => {
      if (a.id === focusMesaId && b.id !== focusMesaId) return -1;
      if (b.id === focusMesaId && a.id !== focusMesaId) return 1;
      return 0;
    });
  }, [filtroEstado, focusMesaId, mesasSalonActivas]);

  async function actualizarEstadoPedido(pedidoId: number, nuevoEstado: string) {
    setActualizandoPedidoId(pedidoId);
    setMensaje(null);
    setError(null);

    let updateQuery = supabase
  .from('pedidos')
  .update({ estado: nuevoEstado })
  .eq('id', pedidoId);

if (currentRestaurantId != null) {
  updateQuery = updateQuery.eq('restaurant_id', currentRestaurantId);
}

const { error: updateError } = await updateQuery;

    if (updateError) {
      console.error('No se pudo actualizar el pedido:', updateError);
      setError('No se pudo actualizar el estado del pedido.');
      setActualizandoPedidoId(null);
      return;
    }

    setMensaje(
      `Pedido #${pedidoId} actualizado a ${formatEstadoLabel(nuevoEstado)}.`
    );
    setActualizandoPedidoId(null);
    await cargarDatos();
  }

  async function enviarItemACocina(pedidoId: number, item: ItemPedido) {
    setActualizandoItemId(item.id);
    setMensaje(null);
    setError(null);

    const { error: updateError } = await supabase
      .from('items_pedido')
      .update({
        comentarios: buildKitchenComment(item.comentarioVisible, 'pendiente'),
      })
      .eq('id', item.id);

    if (updateError) {
      console.error('No se pudo enviar el ítem a cocina:', updateError);
      setError('No se pudo enviar el ítem a cocina.');
      setActualizandoItemId(null);
      return;
    }

    let pedidoUpdateQuery = supabase
  .from('pedidos')
  .update({ estado: 'en_preparacion' })
  .eq('id', pedidoId);

if (currentRestaurantId != null) {
  pedidoUpdateQuery = pedidoUpdateQuery.eq('restaurant_id', currentRestaurantId);
}

const { error: pedidoError } = await pedidoUpdateQuery;

    if (pedidoError) {
      console.error(
        'No se pudo actualizar el pedido al enviar ítem a cocina:',
        pedidoError
      );
      setError('No se pudo actualizar el pedido al enviar ítem a cocina.');
      setActualizandoItemId(null);
      return;
    }

    setMensaje(`Ítem enviado a cocina en el pedido #${pedidoId}.`);
    setActualizandoItemId(null);
    await cargarDatos();
  }

  async function enviarTodoACocina(pedido: Pedido) {
    const itemsMostrador = pedido.items.filter(
      (item) => item.prepTarget === 'mostrador'
    );

    if (itemsMostrador.length === 0) return;

    setEnviandoPedidoACocinaId(pedido.id);
    setMensaje(null);
    setError(null);

    const updates = await Promise.all(
      itemsMostrador.map((item) =>
        supabase
          .from('items_pedido')
          .update({
            comentarios: buildKitchenComment(item.comentarioVisible, 'pendiente'),
          })
          .eq('id', item.id)
      )
    );

    const failed = updates.find((result) => result.error);

    if (failed?.error) {
      console.error('No se pudo enviar todo el pedido a cocina:', failed.error);
      setError('No se pudo enviar todo el pedido a cocina.');
      setEnviandoPedidoACocinaId(null);
      return;
    }

    let pedidoUpdateQuery = supabase
  .from('pedidos')
  .update({ estado: 'en_preparacion' })
  .eq('id', pedido.id);

if (currentRestaurantId != null) {
  pedidoUpdateQuery = pedidoUpdateQuery.eq('restaurant_id', currentRestaurantId);
}

const { error: pedidoError } = await pedidoUpdateQuery;

    if (pedidoError) {
      console.error(
        'No se pudo actualizar el pedido al enviarlo a cocina:',
        pedidoError
      );
      setError('No se pudo actualizar el pedido al enviarlo a cocina.');
      setEnviandoPedidoACocinaId(null);
      return;
    }

    setMensaje(`Pedido #${pedido.id} enviado a cocina.`);
    setEnviandoPedidoACocinaId(null);
    await cargarDatos();
  }

  async function cerrarCuentaMesa(mesaId: number) {
    const mesa = mesasSalonActivas.find((item) => item.id === mesaId);
    if (!mesa) return;

    const mesaLabel = getMesaDisplayName(mesa);

    const confirmar = window.confirm(
      `¿Cerrar la cuenta de ${mesaLabel}? Esto va a pasar todos sus pedidos activos a "cerrado".`
    );
    if (!confirmar) return;

    setCerrandoMesaId(mesaId);
    setMensaje(null);
    setError(null);

    const ids = mesa.pedidos.map((pedido) => pedido.id);

    let cerrarQuery = supabase
  .from('pedidos')
  .update({ estado: 'cerrado', pasado_a_caja: false })
  .in('id', ids);

if (currentRestaurantId != null) {
  cerrarQuery = cerrarQuery.eq('restaurant_id', currentRestaurantId);
}

const { error: updateError } = await cerrarQuery;

    if (updateError) {
      console.error('No se pudo cerrar la cuenta de la mesa:', updateError);
      setError('No se pudo cerrar la cuenta de la mesa.');
      setCerrandoMesaId(null);
      return;
    }

    setMensaje(`Cuenta de ${mesaLabel} cerrada correctamente.`);
    setCerrandoMesaId(null);
    await cargarDatos();
  }

  async function crearPedidoManual() {
    if (carrito.length === 0) {
      setError('Agregá al menos un producto al pedido.');
      return;
    }

    if (manualOrderMode === 'salon') {
      const mesaId = Number(manualMesaId);
      if (!Number.isFinite(mesaId) || mesaId <= DELIVERY_MESA_ID) {
        setError('Seleccioná una mesa válida.');
        return;
      }
    }

    if (manualOrderMode === 'takeaway' && !manualClienteNombre.trim()) {
      setError('Ingresá el nombre del cliente para retirar.');
      return;
    }

    setCreandoPedido(true);
    setMensaje(null);
    setError(null);

    try {
      const payload = {
        mesa_id: manualOrderMode === 'salon' ? Number(manualMesaId) : undefined,
        total: totalCarrito,
        forma_pago: manualFormaPago,
        origen:
          manualOrderMode === 'salon'
            ? 'salon_manual_mostrador'
            : 'takeaway_manual_mostrador',
        tipo_servicio: manualOrderMode === 'salon' ? 'mesa' : 'takeaway',
        medio_pago: manualFormaPago,
        estado_pago: manualFormaPago === 'efectivo' ? 'aprobado' : 'pendiente',
        efectivo_aprobado: manualFormaPago === 'efectivo',
        paga_efectivo: manualFormaPago === 'efectivo',
        cliente_nombre:
          manualOrderMode === 'takeaway'
            ? manualClienteNombre.trim()
            : undefined,
        items: carrito.map((item) => ({
          producto_id: item.producto.id,
          cantidad: item.cantidad,
          comentarios: item.comentarios.trim() || null,
          prep_target: item.prepTarget,
        })),
      };

      const res = await fetch(`/api/pedidos?${restaurantScopeQuery}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.pedido) {
        throw new Error(body?.error || 'No se pudo crear el pedido manual.');
      }

      const pedidoId = Number(body.pedido.id);

      setCarrito([]);
      setManualClienteNombre('');

      setMensaje(
        `Pedido #${pedidoId} creado correctamente desde mostrador. Podés resolverlo acá mismo y, si querés, enviar a cocina solo los ítems necesarios.`
      );

      await cargarDatos();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo crear el pedido manual.'
      );
    } finally {
      setCreandoPedido(false);
    }
  }

  const manualTitle =
    manualOrderMode === 'salon'
      ? 'Alta manual por mesa'
      : 'Alta manual por cliente';

  const manualDescription =
    manualOrderMode === 'salon'
      ? 'Este pedido manual nace asociado a una mesa. Mostrador puede resolverlo acá o enviar a cocina solo los ítems necesarios.'
      : 'Este pedido manual nace asociado a una persona para retirar. Mostrador puede resolverlo acá o enviar a cocina solo los ítems necesarios.';

  const manualIdentifierLabel =
    manualOrderMode === 'salon'
      ? 'Identificación principal: Mesa'
      : 'Identificación principal: Persona';

  if (checkingAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-100">
        <p>Verificando acceso a Mostrador / Caja...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                  MOSTRADOR / CAJA
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  Plan {formatPlanLabel(currentPlan)}
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  Modo {formatBusinessModeLabel(businessMode)}
                </span>

                <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800">
  Sucursal: {currentRestaurantLabel}
</span>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    manualOrderMode === 'salon'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {manualIdentifierLabel}
                </span>

                <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800">
                  🔔 Sonido en nuevos pedidos
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {compactMode ? 'Modo compacto' : 'Modo completo'}
                </span>

                {businessMode === 'restaurant' && canUseWaiterMode ? (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                    Pro / mozo disponible
                  </span>
                ) : null}

                {focusMesaId != null ? (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                    Foco en mesa {focusMesaId}
                  </span>
                ) : null}
                
              </div>

              <h1 className="mt-4 text-3xl font-bold text-slate-900">
                Punto de venta y operación principal
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
                {isRestaurantMode
                  ? 'Mostrador opera el flujo completo: pedidos manuales, apoyo al salón, envío a cocina, cobro, entrega y cierre real de cuenta.'
                  : 'Mostrador opera el flujo completo: pedidos manuales, take away, envío a cocina, entrega, cobro y cierre.'}
              </p>

              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">
                Mozo atiende el salón. Caja cobra y cierra. Cocina sigue como apoyo opcional y solo recibe los ítems que le mandes.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  void cargarDatos();
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Actualizar
              </button>

              <button
                onClick={() => router.push('/cocina')}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Ver cocina
              </button>

              <button
                onClick={() => router.push('/retiro')}
                className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
              >
                Ver pantalla pública
              </button>

              {businessMode === 'restaurant' && canUseWaiterMode ? (
                <button
                  onClick={() => router.push('/mozo/mesas')}
                  className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
                >
                  Ver mozo
                </button>
              ) : null}

              <button
                onClick={() => router.push('/inicio')}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Volver a inicio
              </button>
            </div>
          </div>
        </header>

        {mensaje ? (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {mensaje}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {focusMesaId != null ? (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
            Llegaste desde mozo con foco en la <strong>mesa {focusMesaId}</strong>.
            Acá resolvés el cobro y el cierre real de la cuenta.
          </section>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  isRestaurantMode
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {manualTitle}
              </span>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {manualIdentifierLabel}
              </span>
            </div>

            {isRestaurantMode ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setManualOrderMode('salon')}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                    manualOrderMode === 'salon'
                      ? 'border-emerald-700 bg-emerald-700 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Pedido para salón
                </button>

                <button
                  type="button"
                  onClick={() => setManualOrderMode('takeaway')}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                    manualOrderMode === 'takeaway'
                      ? 'border-amber-600 bg-amber-500 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Pedido take away
                </button>
              </div>
            ) : null}

            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Datos del pedido manual
              </h2>
              <p className="mt-1 text-sm text-slate-600">{manualDescription}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-6 xl:grid-cols-[0.95fr_1.05fr_0.9fr]">
            <div className="space-y-4">
              {manualOrderMode === 'salon' ? (
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">Mesa</span>
                  <select
                    value={manualMesaId}
                    onChange={(e) => setManualMesaId(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {mesasList.length === 0 ? (
                      <option value="">No hay mesas disponibles</option>
                    ) : null}

                    {mesasList.map((mesa) => (
                      <option key={mesa.id} value={mesa.id}>
                        {mesa.numero != null && mesa.numero > 0
                          ? `Mesa ${mesa.numero}`
                          : mesa.nombre || `Mesa ID ${mesa.id}`}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">
                    Nombre del cliente
                  </span>
                  <input
                    type="text"
                    value={manualClienteNombre}
                    onChange={(e) => setManualClienteNombre(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder="Ej: Lucía"
                  />
                </label>
              )}

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">
                  Forma de pago
                </span>
                <select
                  value={manualFormaPago}
                  onChange={(e) => setManualFormaPago(e.target.value as FormaPago)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="virtual">Virtual</option>
                </select>
              </label>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  Preparación por ítem
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Todo pedido nace para resolverse en mostrador. Desde el carrito podés
                  marcar ítems puntuales para cocina.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  Criterio de identificación
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  {manualOrderMode === 'salon'
                    ? 'Este pedido manual nace asociado a una mesa. La mesa es la referencia principal para cobrar y cerrar la cuenta del salón.'
                    : 'Este pedido manual nace asociado a una persona. El nombre del cliente es la referencia principal para preparar y entregar.'}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-900">
                  Categorías
                </h3>

                {categorias.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-600">
                    No hay categorías disponibles.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {categorias.map((cat) => {
                      const activa = categoriaSeleccionada === cat;

                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCategoriaSeleccionada(cat)}
                          className={
                            'rounded-full border px-3 py-1 text-sm ' +
                            (activa
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-300 bg-white text-slate-900')
                          }
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {categoriaSeleccionada == null ? (
                  <p className="text-sm text-slate-600">
                    Elegí una categoría para cargar productos.
                  </p>
                ) : productosFiltrados.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    No hay productos disponibles en esta categoría.
                  </p>
                ) : (
                  productosFiltrados.map((producto) => {
                    const agotado = isProductoAgotado(producto);
                    const itemEnCarrito = carrito.find(
                      (item) => item.producto.id === producto.id
                    );
                    const maxCantidad = getMaxCantidadCarrito(producto);
                    const llegoAlMaximo =
                      itemEnCarrito != null && itemEnCarrito.cantidad >= maxCantidad;
                    const stockMessage = getStockMessage(producto);

                    return (
                      <article
                        key={producto.id}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                      >
                        <div className="flex gap-3 p-4">
                          <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                            {producto.imagen_url ? (
                              <img
                                src={producto.imagen_url}
                                alt={producto.nombre}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-slate-400">
                                Sin imagen
                              </div>
                            )}
                          </div>

                          <div className="flex flex-1 flex-col justify-between">
                            <div>
                              <h3 className="font-semibold text-slate-900">
                                {producto.nombre}
                              </h3>
                              {producto.descripcion ? (
                                <p className="mt-1 text-sm text-slate-600">
                                  {producto.descripcion}
                                </p>
                              ) : null}

                              {stockMessage ? (
                                <p
                                  className={`mt-2 text-xs font-medium ${
                                    agotado ? 'text-rose-700' : 'text-slate-500'
                                  }`}
                                >
                                  {stockMessage}
                                </p>
                              ) : null}
                            </div>

                            <div className="mt-3 flex items-center justify-between gap-3">
                              <p className="font-bold text-slate-900">
                                {formatMoney(producto.precio)}
                              </p>

                              <button
                                type="button"
                                onClick={() => agregarAlCarrito(producto)}
                                disabled={agotado || llegoAlMaximo}
                                className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                                  agotado || llegoAlMaximo
                                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                    : 'bg-amber-500 text-white hover:bg-amber-600'
                                }`}
                              >
                                {agotado ? 'Agotado' : llegoAlMaximo ? 'Máximo' : 'Agregar'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </div>

            <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900">
                Pedido actual
              </h3>

              {carrito.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">
                  Todavía no agregaste productos.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {carrito.map((item) => {
                    const maxCantidad = getMaxCantidadCarrito(item.producto);
                    const tieneLimite = Number.isFinite(maxCantidad);

                    return (
                      <div
                        key={item.producto.id}
                        className="rounded-2xl border border-slate-200 px-3 py-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-1">
  <span className="font-medium text-slate-900">
    {item.producto.nombre}
  </span>
  {renderMarcaBadge(item.producto)}
</div>
                            {tieneLimite ? (
                              <p className="text-xs text-slate-500">
                                Máximo disponible: {maxCantidad}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                cambiarCantidad(item.producto.id, item.cantidad - 1)
                              }
                              className="h-8 w-8 rounded-full border bg-slate-100 text-slate-700"
                            >
                              -
                            </button>

                            <input
                              type="number"
                              min={1}
                              max={tieneLimite ? maxCantidad : undefined}
                              value={item.cantidad}
                              onChange={(e) =>
                                cambiarCantidad(
                                  item.producto.id,
                                  Number(e.target.value)
                                )
                              }
                              className="w-14 rounded border px-1 py-1 text-center text-sm"
                            />

                            <button
                              type="button"
                              onClick={() =>
                                cambiarCantidad(item.producto.id, item.cantidad + 1)
                              }
                              disabled={item.cantidad >= maxCantidad}
                              className="h-8 w-8 rounded-full border bg-amber-100 text-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <textarea
                          className="mt-3 w-full rounded border px-2 py-1 text-sm"
                          placeholder="Notas del producto (opcional)"
                          value={item.comentarios}
                          onChange={(e) =>
                            cambiarComentario(item.producto.id, e.target.value)
                          }
                        />

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              item.prepTarget === 'cocina'
                                ? 'bg-sky-100 text-sky-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {item.prepTarget === 'cocina'
                              ? 'Se envía a cocina'
                              : 'Se resuelve en mostrador'}
                          </span>

                          {item.prepTarget === 'mostrador' ? (
                            <button
                              type="button"
                              onClick={() =>
                                cambiarPrepTargetCarrito(item.producto.id, 'cocina')
                              }
                              className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700"
                            >
                              Enviar a cocina
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                cambiarPrepTargetCarrito(
                                  item.producto.id,
                                  'mostrador'
                                )
                              }
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Resolver en mostrador
                            </button>
                          )}
                        </div>

                        <p className="mt-2 text-right text-sm text-slate-700">
                          Subtotal: {formatMoney(item.producto.precio * item.cantidad)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-5 rounded-2xl border bg-slate-50 p-4">
                <p className="text-right text-lg font-bold text-slate-900">
                  Total: {formatMoney(totalCarrito)}
                </p>

                <button
                  type="button"
                  onClick={() => {
                    void crearPedidoManual();
                  }}
                  disabled={creandoPedido || carrito.length === 0}
                  className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {creandoPedido
                    ? 'Creando pedido...'
                    : manualOrderMode === 'salon'
                    ? 'Crear pedido para mesa'
                    : 'Crear pedido take away'}
                </button>
              </div>
            </aside>
          </div>
        </section>

        {cargando ? (
          <div className="rounded-3xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-600 shadow-sm">
            Cargando mostrador...
          </div>
        ) : null}

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'todos', label: 'Todos' },
                { value: 'pendiente', label: 'Pendientes' },
                { value: 'en_preparacion', label: 'En preparación' },
                { value: 'listo', label: 'Listos' },
              ].map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFiltroEstado(f.value as FiltroEstado)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                    filtroEstado === f.value
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setCompactMode((prev) => !prev)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {compactMode ? 'Cambiar a modo completo' : 'Cambiar a modo compacto'}
            </button>
          </div>
        </div>

        <section className="grid gap-6 xl:grid-cols-2">
          <article
            className={`rounded-2xl border bg-white p-3 shadow-sm ${
              isTakeawayMode ? 'border-amber-300' : 'border-amber-200'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Take away
                </p>
                <h2 className="mt-2 text-lg font-bold text-slate-900">
                  {isTakeawayMode
                    ? 'Pedidos por cliente'
                    : 'Retiros activos (opcional)'}
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  {compactMode
                    ? 'Operación activa de retiros.'
                    : isTakeawayMode
                    ? 'Mostrador puede tomar cualquier pedido, resolverlo acá o mandar a cocina solo los ítems necesarios.'
                    : 'Aunque el modo principal sea restaurante, esta pantalla también puede resolver retiros y derivar ítems a cocina si hace falta.'}
                </p>
              </div>

              <div className="grid gap-2 text-right">
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500">Pendientes</p>
                  <p className="text-xl font-bold text-slate-900">
                    {takeawayResumen.pendientes}
                  </p>
                </div>
                <div className="rounded-xl bg-sky-50 px-3 py-2">
                  <p className="text-[11px] text-sky-700">Preparando</p>
                  <p className="text-xl font-bold text-sky-900">
                    {takeawayResumen.preparando}
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-50 px-3 py-2">
                  <p className="text-[11px] text-emerald-700">Listos</p>
                  <p className="text-xl font-bold text-emerald-900">
                    {takeawayResumen.listos}
                  </p>
                </div>
              </div>
            </div>

            {takeawayPedidosFiltrados.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-amber-300 px-4 py-8 text-center text-sm text-slate-600">
                No hay pedidos take away activos para este filtro.
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
                {takeawayPedidosFiltrados.map((pedido) => {
                  const workflowState = getPedidoWorkflowState(pedido);
                  const paymentBadge = getPaymentBadge(pedido);
                  const normalizedEstado = normalizeText(pedido.estado);
                  const normalizedWorkflowState = normalizeText(workflowState);
                  const ready = normalizedWorkflowState === 'listo';
                  const pending =
                    normalizedWorkflowState === 'pendiente' ||
                    normalizedWorkflowState === 'solicitado';
                  const handledHere = isMostradorManagedPedido(pedido);
                  const isNewPedido = recentPedidoIdsSet.has(pedido.id);

                  const kitchenItems = getKitchenItems(pedido);
                  const hasKitchenItems = kitchenItems.length > 0;
                  const hasPendingKitchen = hasKitchenPendingItems(pedido);
                  const canMarkReady =
                    !ready &&
                    !hasPendingKitchen &&
                    normalizedEstado !== 'entregado' &&
                    normalizedEstado !== 'cerrado';
                  const canTakeHere =
                    !ready &&
                    !hasKitchenItems &&
                    (pending || normalizedEstado === 'solicitado');
                  const canSendAnyToKitchen =
                    !ready &&
                    pedido.items.some((item) => item.prepTarget === 'mostrador');

                  const visibleItems = pedido.items;

                  return (
                    <article
                      key={pedido.id}
                      className={`rounded-lg border px-2 py-1 shadow-sm ${
                        isNewPedido
                          ? 'border-violet-300 bg-violet-50 ring-2 ring-violet-200'
                          : ready
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-medium text-amber-800">
                              TAKE AWAY
                            </span>

                            {isNewPedido ? (
                              <span className="rounded-full bg-violet-700 px-2 py-1 text-[10px] font-semibold text-white">
                                NUEVO
                              </span>
                            ) : null}

                            {handledHere ? (
                              <span className="rounded-full bg-slate-900 px-2 py-1 text-[10px] font-medium text-white">
                                MOSTRADOR
                              </span>
                            ) : null}

                            <span
                              className={`rounded-full border px-2 py-1 text-[10px] font-medium ${getEstadoBadgeClass(
                                workflowState
                              )}`}
                            >
                              {formatEstadoLabel(workflowState)}
                            </span>
                          </div>

                          <h3 className="mt-1 text-sm font-bold leading-tight text-slate-900">
                            {getTakeawayLabel(pedido)}
                          </h3>

                          <p className="mt-0.5 text-[11px] text-slate-600">
                            {pedido.codigo_publico || `Pedido #${pedido.id}`}
                          </p>

                          <p className="mt-0.5 text-[10px] text-slate-500">
                            {compactMode
                              ? `${formatTime(pedido.creado_en)} · ${pedido.items.length} ítem${
                                  pedido.items.length !== 1 ? 's' : ''
                                }`
                              : `Creado: ${formatDateTime(pedido.creado_en)}`}
                          </p>

                          {!compactMode && pedido.estado_pago ? (
                            <p className="mt-0.5 text-[10px] text-slate-500">
                              Pago: {pedido.estado_pago}
                            </p>
                          ) : null}
                        </div>

                        <div className="text-right">
                          <span
                            className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-medium ${paymentBadge.className}`}
                          >
                            {paymentBadge.label}
                          </span>
                          <p className="mt-1 text-[10px] text-slate-500">Total</p>
                          <p className="text-sm font-bold text-slate-900">
                            {formatMoney(pedido.total)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2 space-y-1">
                        {visibleItems.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-lg border border-slate-200 bg-white/80 px-2 py-1.5"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="text-[11px] font-semibold text-slate-900">
  {item.cantidad} × {item.producto?.nombre ?? '—'}
</span>

{renderMarcaBadge(item.producto)}

                                  <span
                                    className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                                      item.prepTarget === 'cocina'
                                        ? item.kitchenState === 'listo'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : item.kitchenState === 'en_preparacion'
                                          ? 'bg-sky-100 text-sky-800'
                                          : 'bg-amber-100 text-amber-800'
                                        : 'bg-slate-100 text-slate-700'
                                    }`}
                                  >
                                    {item.prepTarget === 'cocina'
                                      ? item.kitchenState === 'listo'
                                        ? 'Listo cocina'
                                        : item.kitchenState === 'en_preparacion'
                                        ? 'Preparando'
                                        : 'Enviado'
                                      : 'Mostrador'}
                                  </span>
                                </div>

                                {!compactMode && item.comentarioVisible ? (
                                  <p className="mt-1 text-[10px] text-slate-500">
                                    Nota: {item.comentarioVisible}
                                  </p>
                                ) : null}
                              </div>

                              {item.prepTarget === 'mostrador' && !ready ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void enviarItemACocina(pedido.id, item);
                                  }}
                                  disabled={actualizandoItemId === item.id}
                                  className="rounded-lg bg-sky-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                                >
                                  {actualizandoItemId === item.id
                                    ? '...'
                                    : compactMode
                                    ? 'Cocina'
                                    : 'A cocina'}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1">
                        {canTakeHere ? (
                          <button
                            type="button"
                            onClick={() => {
                              void actualizarEstadoPedido(
                                pedido.id,
                                'en_preparacion'
                              );
                            }}
                            disabled={actualizandoPedidoId === pedido.id}
                            className="rounded-lg bg-sky-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                          >
                            {actualizandoPedidoId === pedido.id
                              ? '...'
                              : compactMode
                              ? 'Tomar'
                              : 'Tomar en mostrador'}
                          </button>
                        ) : null}

                        {canSendAnyToKitchen ? (
                          <button
                            type="button"
                            onClick={() => {
                              void enviarTodoACocina(pedido);
                            }}
                            disabled={enviandoPedidoACocinaId === pedido.id}
                            className="rounded-lg border border-sky-300 bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-60"
                          >
                            {enviandoPedidoACocinaId === pedido.id
                              ? '...'
                              : compactMode
                              ? 'Todo cocina'
                              : 'Todo a cocina'}
                          </button>
                        ) : null}

                        {canMarkReady ? (
                          <button
                            type="button"
                            onClick={() => {
                              void actualizarEstadoPedido(pedido.id, 'listo');
                            }}
                            disabled={actualizandoPedidoId === pedido.id}
                            className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {actualizandoPedidoId === pedido.id
                              ? '...'
                              : compactMode
                              ? 'Listo'
                              : 'Marcar listo'}
                          </button>
                        ) : null}

                        {ready ? (
                          <button
                            type="button"
                            onClick={() => {
                              void actualizarEstadoPedido(pedido.id, 'cerrado');
                            }}
                            disabled={actualizandoPedidoId === pedido.id}
                            className="rounded-lg bg-emerald-700 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                          >
                            {actualizandoPedidoId === pedido.id
                              ? '...'
                              : compactMode
                              ? 'Entregar'
                              : 'Entregado'}
                          </button>
                        ) : null}

                        {hasPendingKitchen ? (
                          <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-600">
                            Cocina pendiente
                          </span>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </article>

          <article
            className={`rounded-2xl border bg-white p-3 shadow-sm ${
              isRestaurantMode ? 'border-emerald-300' : 'border-slate-200'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Salón
                </p>
                <h2 className="mt-2 text-lg font-bold text-slate-900">
                  {isRestaurantMode
                    ? 'Mesas activas'
                    : 'Mesas activas (fuera del modo principal)'}
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  {compactMode
                    ? 'Operación activa de mesas.'
                    : isRestaurantMode
                    ? 'Mostrador también puede apoyar al salón, mandar ítems a cocina y realizar el cobro y cierre final.'
                    : 'El local está configurado en take away. Si aparece información de salón, esta vista funciona como referencia secundaria.'}
                </p>
              </div>

              <div className="grid gap-2 text-right">
                <div className="rounded-xl bg-amber-50 px-3 py-2">
                  <p className="text-[11px] text-amber-700">En curso</p>
                  <p className="text-xl font-bold text-amber-900">
                    {salonResumen.enCurso}
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-50 px-3 py-2">
                  <p className="text-[11px] text-emerald-700">Listas</p>
                  <p className="text-xl font-bold text-emerald-900">
                    {salonResumen.listas}
                  </p>
                </div>
              </div>
            </div>

            {mesasSalonFiltradas.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-600">
                No hay mesas con pedidos activos para este filtro.
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
                {mesasSalonFiltradas.map((mesa) => {
                  const estadoMesa = calcularEstadoMesa(mesa);
const mesaTienePedidoNuevo = mesa.pedidos.some((pedido) =>
  recentPedidoIdsSet.has(pedido.id)
);
const isFocusedMesa = focusMesaId != null && mesa.id === focusMesaId;
const isPassedToCash = mesa.pasadaACaja;
                  const visiblePedidos = mesa.pedidos;

                  return (
                    <article
                      key={mesa.id}
                      className={`rounded-lg border px-2 py-1 shadow-sm ${
                        isFocusedMesa
                          ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200'
                          : mesaTienePedidoNuevo
                          ? 'border-violet-300 bg-violet-50 ring-2 ring-violet-200'
                          : estadoMesa === 'lista'
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1">
                            {getMesaEstadoBadge(estadoMesa)}

                            {(isPassedToCash || isFocusedMesa) ? (
  <span className="rounded-full bg-amber-600 px-2 py-1 text-[10px] font-semibold text-white">
    PASADA A CAJA
  </span>
) : null}

                            {mesaTienePedidoNuevo ? (
                              <span className="rounded-full bg-violet-700 px-2 py-1 text-[10px] font-semibold text-white">
                                PEDIDO NUEVO
                              </span>
                            ) : null}
                          </div>

                          <h3 className="mt-1 text-sm font-bold leading-tight text-slate-900">
                            {getMesaDisplayName(mesa)}
                          </h3>

                          <p className="mt-0.5 text-[10px] text-slate-600">
                            {mesa.pedidos.length} pedido
                            {mesa.pedidos.length !== 1 ? 's' : ''} activo
                            {mesa.pedidos.length !== 1 ? 's' : ''}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-[10px] text-slate-500">Total mesa</p>
                          <p className="text-sm font-bold text-slate-900">
                            {formatMoney(mesa.totalMesa)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2 space-y-1">
                        {visiblePedidos.map((pedido) => {
                          const workflowState = getPedidoWorkflowState(pedido);
                          const paymentBadge = getPaymentBadge(pedido);
                          const handledHere = isMostradorManagedPedido(pedido);
                          const normalizedEstado = normalizeText(pedido.estado);
                          const normalizedWorkflowState = normalizeText(workflowState);
                          const pending =
                            normalizedWorkflowState === 'pendiente' ||
                            normalizedWorkflowState === 'solicitado';
                          const ready = normalizedWorkflowState === 'listo';
                          const isNewPedido = recentPedidoIdsSet.has(pedido.id);

                          const kitchenItems = getKitchenItems(pedido);
                          const hasKitchenItems = kitchenItems.length > 0;
                          const hasKitchenPending = hasKitchenPendingItems(pedido);
                          const canTakeHere =
                            !ready && !hasKitchenItems && pending;
                          const canMarkReady =
                            !ready &&
                            !hasKitchenPending &&
                            normalizedEstado !== 'entregado' &&
                            normalizedEstado !== 'cerrado';
                          const canSendAnyToKitchen =
                            !ready &&
                            pedido.items.some(
                              (item) => item.prepTarget === 'mostrador'
                            );

                          const visibleItems = pedido.items;

                          return (
                            <div
                              key={pedido.id}
                              className={`rounded-lg border px-2 py-1 ${
                                isNewPedido
                                  ? 'border-violet-300 bg-violet-50'
                                  : 'border-slate-200 bg-white/80'
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="text-[11px] font-semibold text-slate-900">
                                      {pedido.codigo_publico || `Pedido #${pedido.id}`}
                                    </span>

                                    {isNewPedido ? (
                                      <span className="rounded-full bg-violet-700 px-2 py-1 text-[10px] font-semibold text-white">
                                        NUEVO
                                      </span>
                                    ) : null}

                                    {handledHere ? (
                                      <span className="rounded-full bg-slate-900 px-2 py-1 text-[10px] font-medium text-white">
                                        MOSTRADOR
                                      </span>
                                    ) : null}

                                    <span
                                      className={`rounded-full border px-2 py-1 text-[10px] font-medium ${getEstadoBadgeClass(
                                        workflowState
                                      )}`}
                                    >
                                      {formatEstadoLabel(workflowState)}
                                    </span>
                                  </div>

                                  <p className="mt-0.5 text-[10px] text-slate-500">
                                    {compactMode
                                      ? `${formatTime(pedido.creado_en)} · ${pedido.items.length} ítem${
                                          pedido.items.length !== 1 ? 's' : ''
                                        }`
                                      : `${formatTime(pedido.creado_en)}${
                                          pedido.estado_pago
                                            ? ` · Pago: ${pedido.estado_pago}`
                                            : ''
                                        }`}
                                  </p>
                                </div>

                                <div className="text-right">
                                  <span
                                    className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-medium ${paymentBadge.className}`}
                                  >
                                    {paymentBadge.label}
                                  </span>
                                  <div className="mt-1 text-[11px] font-semibold text-slate-900">
                                    {formatMoney(pedido.total)}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-1.5 space-y-1">
                                {visibleItems.map((item) => (
                                  <div
                                    key={item.id}
                                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1"
                                  >
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-1">
                                          <span className="text-[11px] font-medium text-slate-900">
  {item.cantidad} × {item.producto?.nombre ?? '—'}
</span>

{renderMarcaBadge(item.producto)}

                                          <span
                                            className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                                              item.prepTarget === 'cocina'
                                                ? item.kitchenState === 'listo'
                                                  ? 'bg-emerald-100 text-emerald-800'
                                                  : item.kitchenState === 'en_preparacion'
                                                  ? 'bg-sky-100 text-sky-800'
                                                  : 'bg-amber-100 text-amber-800'
                                                : 'bg-slate-100 text-slate-700'
                                            }`}
                                          >
                                            {item.prepTarget === 'cocina'
                                              ? item.kitchenState === 'listo'
                                                ? 'Listo cocina'
                                                : item.kitchenState === 'en_preparacion'
                                                ? 'Preparando'
                                                : 'Enviado'
                                              : 'Mostrador'}
                                          </span>
                                        </div>

                                        {!compactMode && item.comentarioVisible ? (
                                          <p className="mt-1 text-[10px] text-slate-500">
                                            Nota: {item.comentarioVisible}
                                          </p>
                                        ) : null}
                                      </div>

                                      {item.prepTarget === 'mostrador' && !ready ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            void enviarItemACocina(pedido.id, item);
                                          }}
                                          disabled={actualizandoItemId === item.id}
                                          className="rounded-lg bg-sky-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                                        >
                                          {actualizandoItemId === item.id
                                            ? '...'
                                            : compactMode
                                            ? 'Cocina'
                                            : 'A cocina'}
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {canTakeHere ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void actualizarEstadoPedido(
                                        pedido.id,
                                        'en_preparacion'
                                      );
                                    }}
                                    disabled={actualizandoPedidoId === pedido.id}
                                    className="rounded-lg bg-sky-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                                  >
                                    {actualizandoPedidoId === pedido.id
                                      ? '...'
                                      : compactMode
                                      ? 'Tomar'
                                      : 'Tomar en mostrador'}
                                  </button>
                                ) : null}

                                {canSendAnyToKitchen ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void enviarTodoACocina(pedido);
                                    }}
                                    disabled={enviandoPedidoACocinaId === pedido.id}
                                    className="rounded-lg border border-sky-300 bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-60"
                                  >
                                    {enviandoPedidoACocinaId === pedido.id
                                      ? '...'
                                      : compactMode
                                      ? 'Todo cocina'
                                      : 'Todo a cocina'}
                                  </button>
                                ) : null}

                                {canMarkReady ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void actualizarEstadoPedido(
                                        pedido.id,
                                        'listo'
                                      );
                                    }}
                                    disabled={actualizandoPedidoId === pedido.id}
                                    className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                  >
                                    {actualizandoPedidoId === pedido.id
                                      ? '...'
                                      : compactMode
                                      ? 'Listo'
                                      : 'Marcar listo'}
                                  </button>
                                ) : null}

                                {hasKitchenPending ? (
                                  <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-600">
                                    Cocina pendiente
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            void cerrarCuentaMesa(mesa.id);
                          }}
                          disabled={cerrandoMesaId === mesa.id}
                          className="rounded-lg bg-rose-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                        >
                          {cerrandoMesaId === mesa.id
                            ? '...'
                            : compactMode
                            ? 'Cerrar cuenta'
                            : 'Cerrar cuenta'}
                        </button>

                        {estadoMesa === 'lista' ? (
                          <span className="rounded-lg border border-emerald-300 bg-emerald-100 px-2 py-1 text-[10px] text-emerald-800">
                            Mesa lista para cerrar
                          </span>
                        ) : (
                          <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-600">
                            Hay pedidos en curso
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {businessMode === 'takeaway' ? (
              <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                El local está configurado en modo <strong>take away</strong>. En
                este contexto la referencia principal sigue siendo la persona, no la mesa.
              </div>
            ) : null}
          </article>
        </section>
      </div>
    </main>
  );
}

export default function MostradorPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-slate-100">
          <p>Cargando mostrador...</p>
        </main>
      }
    >
      <MostradorPageContent />
    </Suspense>
  );
}