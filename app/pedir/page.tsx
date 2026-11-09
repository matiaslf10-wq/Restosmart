'use client';

import { useOrderAlerts } from '@/lib/useOrderAlerts';
import OrderAlertControl from '@/components/OrderAlertControl';
import { CollectionMethods, CollectionReceipt, type PaymentReceipt } from '@/components/CollectionCheckout';
import type { Method } from '@/lib/cobros/model';

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useSearchParams } from 'next/navigation';
import type { BusinessMode } from '@/lib/plans';


type ProductRestaurantConfig = {
  restaurant_id: string;
  visible_en_menu: boolean;
  control_stock: boolean;
  stock_actual: number | string | null;
  permitir_sin_stock: boolean;
};

type Producto = {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  categoria: string | null;
  imagen_url: string | null;
  disponible?: boolean | null;
  control_stock?: boolean | null;
  stock_actual?: number | null;
  permitir_sin_stock?: boolean | null;
  marca_id?: string | null;
  restaurant_configs?: ProductRestaurantConfig[];
};

function normalizeCustomerProductText(value: string | null) {
  return (value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function canOrderCustomerProduct(product: Producto) {
  return product.disponible !== false && (
    !product.control_stock || product.permitir_sin_stock ||
    Number(product.stock_actual ?? 0) > 0
  );
}

// Presentation only: retain a real product ID and its own stock and brand.
// Never combine quantities, prices or stock across the internal brands.
function getCustomerMenuProducts<T extends Producto>(products: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const product of products) {
    const key = JSON.stringify([
      normalizeCustomerProductText(product.categoria), normalizeCustomerProductText(product.nombre),
      normalizeCustomerProductText(product.descripcion), Number(product.precio),
    ]);
    const group = groups.get(key);
    if (group) group.push(product);
    else groups.set(key, [product]);
  }

  return Array.from(groups.values()).flatMap((group) => {
    const brands = new Set(group.map((product) => product.marca_id));
    // Only collapse identical copies explicitly assigned to different brands.
    if (brands.has(null) || brands.has(undefined) || brands.has('') || brands.size !== group.length) {
      return group;
    }
    const representative = [...group].sort((a, b) =>
      Number(Boolean(canOrderCustomerProduct(b))) - Number(Boolean(canOrderCustomerProduct(a))) || a.id - b.id
    )[0];
    return [representative];
  });
}

type RestaurantStatus = 'activo' | 'pausado' | 'cerrado';

type RestaurantPublicContext = {
  id: string | number;
  slug: string;
  plan?: string | null;
  estado?: RestaurantStatus | string | null;
  owner_tenant_id?: string | null;
};

type ItemCarrito = {
  producto: Producto;
  cantidad: number;
  comentarios: string;
};

type LocalPublicConfig = {
  nombre_local?: string | null;
  direccion?: string | null;
  horario_atencion?: string | null;
  business_mode?: BusinessMode | string | null;
};

type PedidoCreado = {
  id: number;
  tracking_token?: string;
  estado?: string | null;
  codigo_publico?: string | null;
  cliente_nombre?: string | null;
};

type PedidoStatusPublico = {
  id: number;
  estado: string | null;
  codigo_publico?: string | null;
  cliente_nombre?: string | null;
};

type FormaPago = 'virtual' | 'efectivo';

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizeBusinessModeForPublic(value: unknown): BusinessMode {
  return String(value ?? '').trim().toLowerCase() === 'takeaway'
    ? 'takeaway'
    : 'restaurant';
}

function normalizePublicSlug(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function formatEstadoPedidoCliente(value: unknown) {
  const estado = normalizeText(value);

  if (estado === 'solicitado') return 'Pedido recibido';
  if (estado === 'pendiente') return 'Pendiente';
  if (estado === 'en_preparacion') return 'En preparación';
  if (estado === 'listo') return 'Listo para retirar';
  if (estado === 'cerrado') return 'Entregado';

  return 'Pedido recibido';
}

function isPedidoListo(value: unknown) {
  return normalizeText(value) === 'listo';
}

function isRestaurantClosedForOrdering(value: unknown) {
  const estado = String(value ?? '').trim().toLowerCase();

  return estado === 'cerrado' || estado === 'pausado';
}

function normalizeStockQuantity(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.trunc(num));
}

function getEffectiveStockInfo(producto: Producto) {
  const configs = Array.isArray(producto.restaurant_configs)
    ? producto.restaurant_configs
    : [];

  const visibleConfigs = configs.filter(
    (config) => config.visible_en_menu !== false
  );

  const stockConfigs = visibleConfigs.filter(
    (config) => config.control_stock === true
  );

  if (stockConfigs.length > 0) {
    return {
      controlStock: true,
      stock: stockConfigs.reduce(
        (total, config) => total + normalizeStockQuantity(config.stock_actual),
        0
      ),
      permitirSinStock: stockConfigs.some(
        (config) => config.permitir_sin_stock === true
      ),
    };
  }

  return {
    controlStock: producto.control_stock === true,
    stock: normalizeStockQuantity(producto.stock_actual),
    permitirSinStock: producto.permitir_sin_stock === true,
  };
}

function getStockDisponible(producto: Producto) {
  const stockInfo = getEffectiveStockInfo(producto);

  if (!stockInfo.controlStock) return null;
  if (stockInfo.permitirSinStock) return null;

  return stockInfo.stock;
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
  const stockInfo = getEffectiveStockInfo(producto);

  if (!stockInfo.controlStock) return null;
  if (stockInfo.permitirSinStock) return 'Stock flexible';

  if (stockInfo.stock <= 0) return 'Sin stock';
  if (stockInfo.stock <= 5) return `Disponibles: ${stockInfo.stock}`;

  return null;
}

function buildPublicEndpoint(
  basePath: string,
  scope: {
    restaurantId?: string | null;
  }
) {
  const params = new URLSearchParams();

  if (scope.restaurantId) {
    params.set('restaurantId', scope.restaurantId);
  }

  const query = params.toString();

  if (!query) return basePath;

  const separator = basePath.includes('?') ? '&' : '?';
  return `${basePath}${separator}${query}`;
}

function LoadingMenu() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <p className="text-slate-700">Cargando menú...</p>
    </main>
  );
}

export default function PedirPage() {
  return (
    <Suspense fallback={<LoadingMenu />}>
      <PedirPageContent />
    </Suspense>
  );
}

function PedirPageContent() {
  const [collectionPayment, setCollectionPayment] = useState<PaymentReceipt | null>(null);
  const searchParams = useSearchParams();
  const restaurantId = useMemo(() => {
  return normalizePublicSlug(
    searchParams.get('restaurantId') ?? searchParams.get('restaurant_id')
  );
}, [searchParams]);

  const hasRestaurantScope = !!restaurantId;

  const productosEndpoint = useMemo(
  () =>
    buildPublicEndpoint('/api/productos?soloDisponibles=1', {
      restaurantId,
    }),
  [restaurantId]
);

const pedidosEndpoint = useMemo(
  () =>
    buildPublicEndpoint('/api/pedidos', {
      restaurantId,
    }),
  [restaurantId]
);

  const [localConfig, setLocalConfig] = useState<LocalPublicConfig | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<
    string | null
  >(null);

  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [clienteNombre, setClienteNombre] = useState('');
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pedidoEnSeguimiento, setPedidoEnSeguimiento] =
  useState<PedidoCreado | null>(null);

const [estadoPedidoSeguimiento, setEstadoPedidoSeguimiento] =
  useState<string | null>(null);

const [pedidoListoAlertado, setPedidoListoAlertado] = useState(false);
const [trackingError, setTrackingError] = useState<string | null>(null);
const alerts = useOrderAlerts('/sounds/PedidoListo.mp3');
const { notify: notifyOrderAlert } = alerts;

  const businessMode = normalizeBusinessModeForPublic(
    localConfig?.business_mode
  );
  const isTakeawayMode = businessMode === 'takeaway';

const reproducirSonidoPedidoListo = useCallback(async () => {
  await notifyOrderAlert('Tu pedido está listo para retirar', `Pedido #${pedidoEnSeguimiento?.id ?? ''}. Acercate al mostrador.`, `ready-${restaurantId}-${pedidoEnSeguimiento?.id}`);
}, [notifyOrderAlert, pedidoEnSeguimiento?.id, restaurantId]);

  const cargarProductos = useCallback(async () => {
    const res = await fetch(productosEndpoint, {
      method: 'GET',
      cache: 'no-store',
    });

    const body = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(body?.error || 'No se pudieron cargar los productos.');
    }

    const listaProductos = (body ?? []) as Producto[];
    setProductos(listaProductos);

    const cats = Array.from(
      new Set(
        listaProductos
          .map((p) => p.categoria)
          .filter((c): c is string => !!c && c.trim() !== '')
      )
    ).sort((a, b) => a.localeCompare(b));

    setCategorias(cats);
    setCategoriaSeleccionada((prev) =>
      prev && cats.includes(prev) ? prev : cats[0] ?? null
    );
  }, [productosEndpoint]);

  useEffect(() => {
    let activo = true;

    async function cargar() {
  try {
    setCargando(true);
    setMensaje(null);
    setError(null);

    if (!hasRestaurantScope) {
      throw new Error(
        'Falta identificar la sucursal del pedido. Volvé a abrir el link desde el QR o desde Inicio.'
      );
    }

        const [contextRes, productosRes] = await Promise.all([
          fetch(`/api/public/contexto?restaurantId=${encodeURIComponent(restaurantId ?? '')}`, { cache: 'no-store' }),
          fetch(productosEndpoint, { cache: 'no-store' }),
        ]);
        const contextBody = await contextRes.json();
        if (!contextRes.ok) throw new Error(contextBody.error || 'No se pudo cargar el local.');
        if (!activo) return;

        setLocalConfig((contextBody.config as LocalPublicConfig | null) ?? null);
        const productosBody = await productosRes.json().catch(() => null);

        if (!productosRes.ok) {
          throw new Error(
            productosBody?.error || 'No se pudieron cargar los productos.'
          );
        }

        const listaProductos = (productosBody as Producto[]) ?? [];
        setProductos(listaProductos);

        const cats = Array.from(
          new Set(
            listaProductos
              .map((p) => p.categoria)
              .filter((c): c is string => !!c && c.trim() !== '')
          )
        ).sort((a, b) => a.localeCompare(b));

        setCategorias(cats);
        setCategoriaSeleccionada(cats[0] ?? null);
      } catch (err) {
        console.error(err);
        if (!activo) return;
        setError(err instanceof Error ? err.message : 'No se pudo cargar el menú.');
      } finally {
        if (activo) {
          setCargando(false);
        }
      }
    }

    void cargar();

    return () => {
      activo = false;
    };
  }, [productosEndpoint, restaurantId, hasRestaurantScope]);

  const productosFiltrados = useMemo(() => {
    if (categoriaSeleccionada == null) return [];
    return getCustomerMenuProducts(productos).filter(
      (producto) => producto.categoria === categoriaSeleccionada
    );
  }, [productos, categoriaSeleccionada]);

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

      return [...prev, { producto, cantidad: 1, comentarios: '' }];
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

  const total = useMemo(
    () =>
      carrito.reduce(
        (acc, item) => acc + item.producto.precio * item.cantidad,
        0
      ),
    [carrito]
  );

  async function confirmarPedido(formaPago: FormaPago, paymentMethod?: Method['kind']) {
if (!hasRestaurantScope) {
  setError(
    'Falta identificar la sucursal del pedido. Volvé a abrir el link desde el QR o desde Inicio.'
  );
  return;
}

    if (!clienteNombre.trim()) {
      setError('Ingresá un nombre para el retiro.');
      return;
    }

    if (carrito.length === 0) {
      setError('El carrito está vacío.');
      return;
    }

    try {
  setEnviando(true);
  setError(null);
  setMensaje(null);

      const nombreRetiro = clienteNombre.trim();

      const items = carrito.map((item) => ({
        producto_id: item.producto.id,
        cantidad: item.cantidad,
        comentarios: item.comentarios.trim() || null,
      }));

      const payload = {
  total,
  forma_pago: formaPago,
        payment_method: paymentMethod,
  origen: 'takeaway_web',
  tipo_servicio: 'takeaway',
  medio_pago: formaPago,
  paga_efectivo: formaPago === 'efectivo',
  cliente_nombre: nombreRetiro,
  items,
};

      const res = await fetch(pedidosEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.pedido) {
        throw new Error(body?.error || 'No se pudo crear el pedido.');
      }

      setCollectionPayment(body.payment ?? null);
      const pedido = body.pedido as PedidoCreado;
      setPedidoEnSeguimiento(pedido);
      setTrackingError(null);
      try {
        localStorage.setItem('restosmart:takeaway:' + restaurantId, JSON.stringify({
          id: pedido.id, estado: pedido.estado, codigo_publico: pedido.codigo_publico,
          tracking_token: pedido.tracking_token,
          payment: body.payment ?? null,
        }));
      } catch { /* Tracking also works when storage is unavailable. */ }
setEstadoPedidoSeguimiento(pedido.estado ?? 'solicitado');
setPedidoListoAlertado(false);

      setCarrito([]);
setClienteNombre('');
await cargarProductos();
      setMensaje(
  formaPago === 'efectivo'
    ? `Pedido #${pedido.id} generado correctamente para ${nombreRetiro}. Quedó registrado para pagar al retirar.`
    : `Pedido #${pedido.id} generado correctamente para ${nombreRetiro}. Quedó registrado con pago virtual pendiente.`
);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'Ocurrió un error al confirmar el pedido.'
      );
    } finally {
      setEnviando(false);
    }
  }

  useEffect(() => {
    setPedidoEnSeguimiento(null);
    setEstadoPedidoSeguimiento(null);
    setPedidoListoAlertado(false);
    setTrackingError(null);
    setCollectionPayment(null);
    if (!restaurantId) return;
    let live = true;
    const key = 'restosmart:takeaway:' + restaurantId;
    async function restoreActiveOrder() {
      try {
        const saved = JSON.parse(localStorage.getItem(key) || 'null');
        if (!saved || !Number.isSafeInteger(saved.id) || typeof saved.tracking_token !== 'string') return;
        const response = await fetch('/api/public/pedido-estado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restaurantId, token: saved.tracking_token }), cache: 'no-store', signal: AbortSignal.timeout(10000) });
        const body = await response.json();
        if (!live) return;
        if (!response.ok || body.pedido?.id !== saved.id) return;
        if (['cerrado','entregado','cancelado'].includes(body.pedido.estado)) { localStorage.removeItem(key); return; }
        if (saved.payment?.token) setCollectionPayment(saved.payment);
        setPedidoEnSeguimiento({ ...saved, estado: body.pedido.estado } as PedidoCreado);
        setEstadoPedidoSeguimiento(body.pedido.estado);
      } catch { /* A previous order is shown only after its active state is verified. */ }
    }
    void restoreActiveOrder();
    return () => { live = false; };
  }, [restaurantId]);

  useEffect(() => {
  const pedidoSeguimientoId = pedidoEnSeguimiento?.id;

  if (!pedidoSeguimientoId || !hasRestaurantScope) return;
  const token = pedidoEnSeguimiento?.tracking_token;
  if (!token) {
    setTrackingError('Este pedido anterior no tiene seguimiento en este dispositivo. Consultá su número en el mostrador.');
    return;
  }

  let active = true;
  let inFlight = false;

  async function consultarEstadoPedido() {
    if (inFlight) return;
    inFlight = true;
    try {
      const res = await fetch('/api/public/pedido-estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, token }),
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });

      const body = await res.json().catch(() => null);

      if (!active) return;
      if (!res.ok) {
        setTrackingError(body?.error || 'No se pudo actualizar el seguimiento. Reintentamos automáticamente.');
        return;
      }
      const pedidoActual = body?.pedido as PedidoStatusPublico | undefined;
      if (!pedidoActual || Number(pedidoActual.id) !== Number(pedidoSeguimientoId)) {
        setTrackingError('No se pudo verificar el estado del pedido.');
        return;
      }
      setTrackingError(null);

      const nuevoEstado = pedidoActual.estado ?? null;
      if (['cerrado','entregado','cancelado'].includes(nuevoEstado || '')) {
        try { localStorage.removeItem('restosmart:takeaway:' + restaurantId); } catch { /* Storage can be unavailable. */ }
      }
      setEstadoPedidoSeguimiento(nuevoEstado);
      if (nuevoEstado === 'cerrado' || nuevoEstado === 'entregado') {
        setPedidoListoAlertado(false);
        setMensaje('Tu pedido fue entregado. ¡Gracias!');
      }

      if (isPedidoListo(nuevoEstado) && !pedidoListoAlertado) {
        setPedidoListoAlertado(true);
        setMensaje(
          `✅ Tu pedido ${
            pedidoActual.codigo_publico || `#${pedidoActual.id}`
          } está listo para retirar.`
        );
        void reproducirSonidoPedidoListo();
      }
    } catch {
      if (active) setTrackingError('Sin conexión al seguimiento. Reintentamos automáticamente.');
    } finally {
      inFlight = false;
    }
  }

  void consultarEstadoPedido();

  const interval = setInterval(() => {
    void consultarEstadoPedido();
  }, 5000);

  const resume = () => { if (document.visibilityState === 'visible') void consultarEstadoPedido(); };
  window.addEventListener('focus', resume);
  document.addEventListener('visibilitychange', resume);
  return () => {
    active = false;
    clearInterval(interval);
    window.removeEventListener('focus', resume);
    document.removeEventListener('visibilitychange', resume);
  };
}, [
  hasRestaurantScope,
  pedidoEnSeguimiento?.id,
  pedidoEnSeguimiento?.tracking_token,
  pedidoListoAlertado,
  restaurantId,
  reproducirSonidoPedidoListo,
]);

  const pedidoEntregado = ['cerrado', 'entregado'].includes(estadoPedidoSeguimiento ?? '');
  const localNombre = localConfig?.nombre_local?.trim() || 'RestoSmart';
  const localDireccion = localConfig?.direccion?.trim() || '';
  const localHorario = localConfig?.horario_atencion?.trim() || '';

  const heroBadge = isTakeawayMode ? 'TAKE AWAY' : 'PEDIDO ONLINE';
  const heroTitle = 'Hacé tu pedido para retirar';
  const heroDescription =
    'Elegí tus productos, indicá tu nombre y confirmá el pedido. Te avisaremos cuando esté listo para retirar por el mostrador.';

  const sideTitle = 'Tu pedido';
  const menuTitle = 'Menú';
  const helperText =
    'Tu pedido queda registrado con tu nombre para que puedan identificarlo al momento del retiro.';

  if (cargando) {
    return <LoadingMenu />;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="rounded-3xl border bg-white p-6 shadow-sm">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                {heroBadge}
              </span>
            </div>

            <h1 className="mt-3 text-3xl font-bold text-slate-900">
              {localNombre}
            </h1>

            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {heroTitle}
            </p>

            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              {heroDescription}
            </p>

            {(localDireccion || localHorario) && (
              <div className="mt-3 space-y-1 text-sm text-slate-600">
                {localDireccion ? <p>📍 {localDireccion}</p> : null}
                {localHorario ? <p>🕒 {localHorario}</p> : null}
              </div>
            )}
          </div>
        </header>

        {mensaje ? (
          <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
            {mensaje}
          </div>
        ) : null}

        {trackingError ? <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">{trackingError}</p> : null}
        <OrderAlertControl alerts={alerts} />
        <CollectionReceipt payment={collectionPayment} />
        {pedidoEnSeguimiento ? (
  <section
    className={`rounded-3xl border p-5 shadow-sm ${
      pedidoListoAlertado
        ? 'border-emerald-400 bg-emerald-50'
        : 'border-amber-300 bg-amber-50'
    }`}
  >
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
            pedidoListoAlertado
              ? 'bg-emerald-600 text-white'
              : 'bg-amber-200 text-amber-900'
          }`}
        >
          {pedidoEntregado ? 'PEDIDO ENTREGADO' : pedidoListoAlertado ? 'LISTO PARA RETIRAR' : 'PEDIDO EN CURSO'}
        </span>

        <h2 className="mt-3 text-2xl font-bold text-slate-900">
          {pedidoEntregado ? '¡Gracias por tu pedido!' : pedidoListoAlertado
            ? '¡Tu pedido ya está listo!'
            : 'Estamos preparando tu pedido'}
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          Pedido{' '}
          <strong>
            {pedidoEnSeguimiento.codigo_publico ||
              `#${pedidoEnSeguimiento.id}`}
          </strong>
          {' · '}
          Estado:{' '}
          <strong>
            {formatEstadoPedidoCliente(estadoPedidoSeguimiento)}
          </strong>
        </p>

        <p className="mt-1 text-sm text-slate-600">
  {pedidoEntregado ? 'El local confirmó la entrega de tu pedido.' : pedidoListoAlertado
    ? 'Acercate al mostrador para retirarlo.'
    : 'No cierres esta página. Cuando el local marque tu pedido como listo, te avisamos acá con un cartel y sonido.'}
</p>

{!pedidoListoAlertado && !pedidoEntregado ? (
  <div className="mt-4 rounded-2xl border border-amber-300 bg-white/70 px-4 py-3 text-sm text-amber-900">
    <strong>Importante:</strong> mantené esta pantalla abierta para recibir el aviso.
    El aviso aparece con esta página abierta; al volver a ella actualizamos el estado. El sonido depende de los permisos del celular.
  </div>
) : null}
        
      </div>

      <div
        className={`grid h-20 w-20 place-items-center rounded-3xl text-4xl ${
          pedidoListoAlertado
            ? 'bg-emerald-600 text-white animate-pulse'
            : 'bg-white text-amber-600'
        }`}
      >
        {pedidoListoAlertado ? '✅' : '⏳'}
      </div>
    </div>
  </section>
) : null}

        {error ? (
          <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-4">
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                Datos para el retiro
              </h2>

              <div className="mt-4 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">
                    Nombre para retirar
                  </span>
                  <input
                    type="text"
                    value={clienteNombre}
                    onChange={(e) => setClienteNombre(e.target.value)}
                    className="rounded-xl border px-3 py-2"
                    placeholder="Ej: Lucía"
                  />
                </label>

                <p className="text-xs text-slate-500">
  Este nombre se guarda dentro del pedido y se usa para identificarlo cuando esté listo.
</p>
              </div>
            </div>

            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                Categorías
              </h2>

              {categorias.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">
                  No hay categorías disponibles.
                </p>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
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

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">
                {menuTitle}
              </h2>

              {categoriaSeleccionada == null && (
                <p className="text-sm text-slate-600">
                  No hay una categoría seleccionada.
                </p>
              )}

              {categoriaSeleccionada != null &&
                productosFiltrados.length === 0 && (
                  <p className="text-sm text-slate-600">
                    No hay productos disponibles en esta categoría.
                  </p>
                )}

              {categoriaSeleccionada != null &&
                productosFiltrados.length > 0 && (
                  <div className="grid gap-4 md:grid-cols-2">
                    {productosFiltrados.map((p) => {
                      const agotado = isProductoAgotado(p);
                      const itemEnCarrito = carrito.find(
                        (item) => item.producto.id === p.id
                      );
                      const maxCantidad = getMaxCantidadCarrito(p);
                      const llegoAlMaximo =
                        itemEnCarrito != null &&
                        itemEnCarrito.cantidad >= maxCantidad;
                      const stockMessage = getStockMessage(p);

                      return (
                        <article
                          key={p.id}
                          className="overflow-hidden rounded-3xl border bg-white shadow-sm"
                        >
                          <div className="flex gap-3 p-4">
                            <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                              {p.imagen_url ? (
                                <img
                                  src={p.imagen_url}
                                  alt={p.nombre}
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
                                  {p.nombre}
                                </h3>

                                {p.descripcion ? (
                                  <p className="mt-1 text-sm text-slate-600">
                                    {p.descripcion}
                                  </p>
                                ) : null}

                                {stockMessage ? (
                                  <p
                                    className={`mt-2 text-xs font-medium ${
                                      agotado
                                        ? 'text-rose-700'
                                        : 'text-slate-500'
                                    }`}
                                  >
                                    {stockMessage}
                                  </p>
                                ) : null}
                              </div>

                              <div className="mt-3 flex items-center justify-between gap-3">
                                <p className="font-bold text-slate-900">
                                  {formatMoney(p.precio)}
                                </p>

                                <button
                                  type="button"
                                  onClick={() => agregarAlCarrito(p)}
                                  disabled={agotado || llegoAlMaximo}
                                  className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                                    agotado || llegoAlMaximo
                                      ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                      : 'bg-amber-500 text-white hover:bg-amber-600'
                                  }`}
                                >
                                  {agotado
                                    ? 'Agotado'
                                    : llegoAlMaximo
                                    ? 'Máximo'
                                    : 'Agregar'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
            </section>
          </section>

          <aside className="space-y-4">
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">
                {sideTitle}
              </h2>

              {carrito.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">
                  El carrito está vacío.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {carrito.map((item) => {
                    const maxCantidad = getMaxCantidadCarrito(item.producto);
                    const tieneLimite = maxCantidad !== Number.MAX_SAFE_INTEGER;

                    return (
                      <div
                        key={item.producto.id}
                        className="rounded-2xl border px-3 py-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-medium text-slate-900">
                              {item.producto.nombre}
                            </span>
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
                                cambiarCantidad(
                                  item.producto.id,
                                  item.cantidad - 1
                                )
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
                                cambiarCantidad(
                                  item.producto.id,
                                  item.cantidad + 1
                                )
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

                        <p className="mt-2 text-right text-sm text-slate-700">
                          Subtotal:{' '}
                          {formatMoney(item.producto.precio * item.cantidad)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-5 rounded-2xl border bg-slate-50 p-4">
                <p className="text-right text-lg font-bold text-slate-900">
                  Total: {formatMoney(total)}
                </p>


                <CollectionMethods restaurantId={restaurantId} disabled={enviando || carrito.length === 0} onChoose={method => { void confirmarPedido(method === 'efectivo' ? 'efectivo' : 'virtual', method); }} />

                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  {helperText}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}