'use client';

import TableOrderTracking, { type TrackedTableOrder } from '@/components/TableOrderTracking';
import { CollectionMethods, CollectionReceipt, type PaymentReceipt } from '@/components/CollectionCheckout';
import type { Method } from '@/lib/cobros/model';



import Link from 'next/link';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useParams, useSearchParams } from 'next/navigation';

const DELIVERY_MESA_ID = 0;

async function leerMesaPublica(restaurantId: string, numero: number) {
  const response = await fetch(`/api/public/mesa?restaurantId=${encodeURIComponent(restaurantId)}&numero=${numero}`, { cache: 'no-store' });
  const body = await response.json();
  return response.ok ? { data: body, error: null } : { data: null, error: { message: body.error } };
}

type Producto = {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  categoria: string | null;
  imagen_url: string | null;
  marca_id?: string | null;
  disponible?: boolean | null;
  control_stock?: boolean | null;
  stock_actual?: number | null;
  permitir_sin_stock?: boolean | null;
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

type ItemCarrito = {
  producto: Producto;
  cantidad: number;
  comentarios: string;
};

type Mesa = {
  id: number;
  numero: number | null;
  nombre: string;
  restaurant_id?: string | number | null;
};

type PedidoCreado = {
  id: number;
  estado: string;
  mesa_id: number;
};

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

function buildScopedEndpoint(basePath: string, restaurantScopeQuery: string) {
  if (!restaurantScopeQuery) return basePath;

  const separator = basePath.includes('?') ? '&' : '?';
  return `${basePath}${separator}${restaurantScopeQuery}`;
}

function MesaPageContent() {
  const params = useParams();
  const [collectionPayment, setCollectionPayment] = useState<PaymentReceipt | null>(null);
  const searchParams = useSearchParams();
  const rawMesaIdParam = params?.id ?? params?.mesaId;
const rawMesaId = rawMesaIdParam as string | string[] | undefined;
  const mesaRutaId = Number(Array.isArray(rawMesaId) ? rawMesaId[0] : rawMesaId);
  const currentRestaurantId = useMemo(() => {
  return (
    searchParams.get('restaurantId') ??
    searchParams.get('restaurant_id') ??
    null
  );
}, [searchParams]);

const hasRestaurantScope = !!currentRestaurantId;

const restaurantScopeQuery = useMemo(() => {
  if (!currentRestaurantId) return '';

  const params = new URLSearchParams();
  params.set('restaurantId', currentRestaurantId);

  return params.toString();
}, [currentRestaurantId]);

const productosEndpoint = useMemo(
  () =>
    buildScopedEndpoint(
      '/api/productos?soloDisponibles=1',
      restaurantScopeQuery
    ),
  [restaurantScopeQuery]
);

const pedidosEndpoint = useMemo(
  () => buildScopedEndpoint('/api/pedidos', restaurantScopeQuery),
  [restaurantScopeQuery]
);

  const [mesa, setMesa] = useState<Mesa | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string | null>(
    null
  );

  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [trackedOrder, setTrackedOrder] = useState<TrackedTableOrder | null>(null);

  const mesaValida = Number.isFinite(mesaRutaId) && mesaRutaId > DELIVERY_MESA_ID;

  const cargarMesa = useCallback(async () => {
  if (!mesaValida || !currentRestaurantId) {
    setMesa(null);
    return null;
  }

  const { data: mesaData, error: mesaError } = await leerMesaPublica(currentRestaurantId, mesaRutaId);

  if (mesaError) {
    console.error('Error cargando mesa:', {
      message: mesaError.message,
      details: (mesaError as any)?.details,
      hint: (mesaError as any)?.hint,
      code: (mesaError as any)?.code,
      raw: mesaError,
    });

    setMensaje('No se pudo cargar la mesa.');
    setMesa(null);
    return null;
  }

  const mesaActual = (mesaData as Mesa | null) ?? null;
  setMesa(mesaActual);
  return mesaActual;
}, [mesaRutaId, mesaValida, currentRestaurantId]);

  const cargarProductos = useCallback(async () => {
  const productosRes = await fetch(productosEndpoint, {
    method: 'GET',
    cache: 'no-store',
  });

  const productosBody = await productosRes.json().catch(() => null);

  if (!productosRes.ok) {
    console.error('Error cargando productos por API:', {
      status: productosRes.status,
      body: productosBody,
    });

    setMensaje(
      productosBody?.error || 'No se pudieron cargar los productos.'
    );
    setProductos([]);
    setCategorias([]);
    setCategoriaSeleccionada(null);
    return;
  }

  const lista = (productosBody as Producto[]) ?? [];
  setProductos(lista);

  const cats = Array.from(
    new Set(
      lista
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
  const cargarDatosIniciales = async () => {
    if (!mesaValida) {
      setCargando(false);
      return;
    }

    setCargando(true);

    try {
      if (!currentRestaurantId) {
  setMensaje(
    'Falta identificar la sucursal de esta mesa. Volvé a abrir el QR desde Inicio o desde Mesas y QR.'
  );
  setMesa(null);
  setProductos([]);
  setCategorias([]);
  setCategoriaSeleccionada(null);
  setCargando(false);
  return;
}

const mesaPromise = leerMesaPublica(currentRestaurantId, mesaRutaId);

const productosPromise = fetch(productosEndpoint, {
  method: 'GET',
  cache: 'no-store',
});

      const [{ data: mesaData, error: mesaError }, productosRes] =
        await Promise.all([mesaPromise, productosPromise]);

      if (mesaError) {
        console.error('Error cargando mesa:', {
          message: mesaError.message,
          details: (mesaError as any)?.details,
          hint: (mesaError as any)?.hint,
          code: (mesaError as any)?.code,
          raw: mesaError,
        });
        setMensaje('No se pudo cargar la mesa.');
      } else {
        setMesa((mesaData as Mesa | null) ?? null);
      }

      const productosBody = await productosRes.json().catch(() => null);

      if (!productosRes.ok) {
        console.error('Error cargando productos por API:', {
          status: productosRes.status,
          body: productosBody,
        });
        setMensaje(
          productosBody?.error || 'No se pudieron cargar los productos.'
        );
      } else {
        const lista = (productosBody as Producto[]) ?? [];
        setProductos(lista);

        const cats = Array.from(
          new Set(
            lista
              .map((p) => p.categoria)
              .filter((c): c is string => !!c && c.trim() !== '')
          )
        ).sort((a, b) => a.localeCompare(b));

        setCategorias(cats);
        setCategoriaSeleccionada(cats[0] ?? null);
      }
    } finally {
      setCargando(false);
    }
  };

  void cargarDatosIniciales();
}, [mesaRutaId, mesaValida, productosEndpoint, currentRestaurantId, hasRestaurantScope]);

  // El seguimiento público requiere una autorización de cuenta aún no disponible.

  const agregarAlCarrito = (producto: Producto) => {
    if (isProductoAgotado(producto)) {
      setMensaje(`"${producto.nombre}" está sin stock.`);
      return;
    }

    setCarrito((prev) => {
      const existente = prev.find((i) => i.producto.id === producto.id);
      const maxCantidad = getMaxCantidadCarrito(producto);

      if (existente) {
        if (existente.cantidad >= maxCantidad) {
          setMensaje(`No hay más stock disponible para "${producto.nombre}".`);
          return prev;
        }

        return prev.map((i) =>
          i.producto.id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i
        );
      }

      return [...prev, { producto, cantidad: 1, comentarios: '' }];
    });
  };

  const cambiarCantidad = (productoId: number, cantidad: number) => {
    const itemActual = carrito.find((item) => item.producto.id === productoId);
    if (!itemActual) return;

    if (cantidad <= 0) {
      setCarrito((prev) => prev.filter((i) => i.producto.id !== productoId));
      return;
    }

    const maxCantidad = getMaxCantidadCarrito(itemActual.producto);
    const cantidadAjustada = Math.min(cantidad, maxCantidad);

    if (cantidadAjustada <= 0) {
      setMensaje(`"${itemActual.producto.nombre}" está sin stock.`);
      setCarrito((prev) => prev.filter((i) => i.producto.id !== productoId));
      return;
    }

    if (cantidadAjustada !== cantidad) {
      setMensaje(`Solo hay ${maxCantidad} unidad(es) disponible(s) de "${itemActual.producto.nombre}".`);
    }

    setCarrito((prev) =>
      prev.map((i) =>
        i.producto.id === productoId ? { ...i, cantidad: cantidadAjustada } : i
      )
    );
  };

  const cambiarComentario = (productoId: number, texto: string) => {
    setCarrito((prev) =>
      prev.map((i) => (i.producto.id === productoId ? { ...i, comentarios: texto } : i))
    );
  };

  const total = useMemo(
    () => carrito.reduce((acc, item) => acc + item.producto.precio * item.cantidad, 0),
    [carrito]
  );

  const crearPedidoDesdeCarrito = async (
    formaPago: 'virtual' | 'efectivo', paymentMethod?: Method['kind']
  ): Promise<PedidoCreado | null> => {
    if (!hasRestaurantScope) {
  setMensaje(
    'Falta identificar la sucursal de esta mesa. Volvé a abrir el QR desde Inicio o desde Mesas y QR.'
  );
  return null;
}
    if (!mesa?.id) return null;

    if (carrito.length === 0) {
      setMensaje('No hay productos en el pedido.');
      return null;
    }

    setEnviando(true);
    setMensaje(null);

    try {
      const payload = {
        mesa_id: mesa.id,
        total,
        forma_pago: formaPago,
        payment_method: paymentMethod,
        paga_efectivo: formaPago === 'efectivo',
        origen: 'salon',
        tipo_servicio: 'mesa',
        medio_pago: formaPago === 'efectivo' ? 'efectivo' : 'virtual',
        items: carrito.map((item) => ({
          producto_id: item.producto.id,
          cantidad: item.cantidad,
          comentarios: item.comentarios || null,
        })),
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
        console.error('Error creando pedido por API:', {
          status: res.status,
          body,
          payload,
        });
        setMensaje(body?.error || 'Hubo un error al crear el pedido.');
        return null;
      }

      setCollectionPayment(body.payment ?? null);
      setTrackedOrder(body.pedido as TrackedTableOrder);
      setMensaje(`Pedido #${body.pedido.id} registrado. El pago sigue pendiente hasta la verificación del comercio.`);
      setCarrito([]);
      await cargarProductos();
      return body.pedido as PedidoCreado;
    } catch {
      setMensaje('No se pudo conectar. Revisá el pedido antes de reintentar.');
      return null;
    } finally {
      setEnviando(false);
    }
  };

  if (!mesaValida) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Acceso de mesa
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            Esta URL no corresponde a una mesa válida
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            El acceso del salón usa la ruta <code>/mesa/[id]</code> con el ID interno
            de cada mesa. Si llegaste desde un QR viejo o mal impreso, pedile ayuda
            al personal del local.
          </p>

          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/inicio"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Ir al inicio
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!hasRestaurantScope) {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
          Falta sucursal
        </p>

        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          Este QR no identifica una sucursal
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Para pedir desde una mesa, el enlace tiene que incluir la sucursal del
          local. Volvé a escanear el QR impreso desde Mesas y QR.
        </p>

        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link
            href="/inicio"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}

  if (cargando) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>Cargando menú...</p>
      </main>
    );
  }

  if (!mesa) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Acceso de mesa
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            La mesa no existe o no está habilitada
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Este acceso digital está reservado para mesas del salón. Revisá el QR o
            pedile ayuda al personal del local.
          </p>

          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Si este QR fue generado antes de la corrección de numeración, puede que
            ya no coincida con la mesa visible y haya que reimprimirlo.
          </p>

          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/inicio"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Ir al inicio
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const productosFiltrados =
    categoriaSeleccionada == null
      ? []
      : getCustomerMenuProducts(productos).filter(
          (p) => p.categoria === categoriaSeleccionada
        );

  const hayItemsEnCarrito = carrito.length > 0;

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center px-4 py-6">
      {currentRestaurantId && <TableOrderTracking key={`${currentRestaurantId}:${mesaRutaId}`} restaurantId={currentRestaurantId} table={mesaRutaId} order={trackedOrder} />}

      <div className="w-full max-w-lg space-y-4">
        <header className="text-center space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Pedido desde mesa
          </p>

          <h1 className="text-2xl font-bold">
            Menú – {mesa.numero != null ? `Mesa ${mesa.numero}` : mesa.nombre}
          </h1>

          <p className="text-sm text-slate-600">
            Escaneaste el acceso del salón. Desde acá podés pedir y pagar desde tu
            celular.
          </p>

          {mensaje && (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg">
              {mensaje}
            </p>
          )}
        </header>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-center">Categorías</h2>
          {categorias.length === 0 && (
            <p className="text-sm text-slate-600 text-center">
              No hay categorías configuradas.
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            {categorias.map((cat) => {
              const activa = categoriaSeleccionada === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() =>
                    setCategoriaSeleccionada((prev) => (prev === cat ? null : cat))
                  }
                  className={
                    'px-3 py-1 rounded-full text-sm border ' +
                    (activa
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-900 border-slate-300')
                  }
                >
                  {cat}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 text-center">
            {categoriaSeleccionada == null
              ? 'Elegí una categoría para ver los platos.'
              : `Mostrando categoría: ${categoriaSeleccionada}`}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Platos</h2>

          {categoriaSeleccionada == null && (
            <p className="text-sm text-slate-600">
              Todavía no seleccionaste una categoría.
            </p>
          )}

          {categoriaSeleccionada != null && productosFiltrados.length === 0 && (
            <p className="text-sm text-slate-600">
              No hay productos disponibles en esta categoría.
            </p>
          )}

          {categoriaSeleccionada != null && productosFiltrados.length > 0 && (
            <div className="space-y-3">
              {productosFiltrados.map((p) => {
                const agotado = isProductoAgotado(p);
                const itemEnCarrito = carrito.find((item) => item.producto.id === p.id);
                const maxCantidad = getMaxCantidadCarrito(p);
                const llegoAlMaximo =
                  itemEnCarrito != null && itemEnCarrito.cantidad >= maxCantidad;


                return (
                  <article
                    key={p.id}
                    className="border border-slate-200 rounded-xl bg-white shadow-sm flex gap-3 overflow-hidden"
                  >
                    <div className="w-24 h-24 bg-slate-100 flex-shrink-0">
                      {p.imagen_url ? (
                        <img
                          src={p.imagen_url}
                          alt={p.nombre}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 px-1 text-center">
                          Sin imagen
                        </div>
                      )}
                    </div>

                    <div className="flex-1 px-3 py-2 flex flex-col justify-between">
                      <div>
                        <h3 className="font-semibold">{p.nombre}</h3>
                        {p.descripcion && (
                          <p className="text-sm text-slate-600">{p.descripcion}</p>
                        )}

                      </div>

                      <div className="mt-1 flex items-center justify-between">
                        <p className="font-bold">${p.precio}</p>
                        <button
                          className={`px-3 py-1 rounded-lg text-sm ${
                            agotado || llegoAlMaximo
                              ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                              : 'bg-emerald-600 text-white hover:bg-emerald-700'
                          }`}
                          onClick={() => agregarAlCarrito(p)}
                          disabled={agotado || llegoAlMaximo}
                        >
                          {agotado ? 'Agotado' : llegoAlMaximo ? 'Máximo' : 'Agregar'}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="border-t border-slate-200 pt-4 space-y-3">
          <h2 className="text-xl font-semibold">Tu pedido</h2>
          {carrito.length === 0 && (
            <p className="text-sm text-slate-600">El carrito está vacío.</p>
          )}

          {carrito.map((item) => {
            const maxCantidad = getMaxCantidadCarrito(item.producto);
            const tieneLimite = Number.isFinite(maxCantidad);

            return (
              <div
                key={item.producto.id}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm space-y-2"
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <span className="font-medium">{item.producto.nombre}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          cambiarCantidad(item.producto.id, item.cantidad - 1)
                        }
                        className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 border border-slate-300 text-base font-bold hover:bg-slate-200"
                        title="Restar una unidad"
                        aria-label={`Restar una unidad de ${item.producto.nombre}`}
                      >
                        -
                      </button>

                      <input
                        type="number"
                        min={1}
                        max={tieneLimite ? maxCantidad : undefined}
                        value={item.cantidad}
                        onChange={(e) =>
                          cambiarCantidad(item.producto.id, Number(e.target.value))
                        }
                        className="w-14 border border-slate-300 rounded px-1 py-1 text-sm text-center"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          cambiarCantidad(item.producto.id, item.cantidad + 1)
                        }
                        disabled={item.cantidad >= maxCantidad}
                        className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300 text-base font-bold hover:bg-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Sumar una unidad"
                        aria-label={`Sumar una unidad a ${item.producto.nombre}`}
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => cambiarCantidad(item.producto.id, 0)}
                      className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 border border-rose-200 text-sm font-bold hover:bg-rose-200"
                      title="Eliminar producto"
                      aria-label={`Eliminar ${item.producto.nombre}`}
                    >
                      ×
                    </button>
                  </div>
                </div>

                <textarea
                  className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                  placeholder="Notas (ej: sin sal, bien jugoso...)"
                  value={item.comentarios}
                  onChange={(e) => cambiarComentario(item.producto.id, e.target.value)}
                />
                <p className="text-right text-sm">
                  Subtotal: ${item.producto.precio * item.cantidad}
                </p>
              </div>
            );
          })}

          {hayItemsEnCarrito && (
            <div className="space-y-1">
              <p className="text-right text-lg font-bold">Total: ${total}</p>
              <p className="text-xs text-slate-500 text-right">
                Para confirmar tu pedido elegí cómo querés pagarlo.
              </p>
            </div>
          )}
        </section>

        <section className="mt-4 border-t border-slate-200 pt-4 space-y-3">
          <h2 className="text-lg font-semibold">Confirmación y pago</h2>
          <p className="text-sm text-slate-600">
            {hayItemsEnCarrito
              ? 'Elegí una opción para confirmar el pedido.'
              : 'Si ya tenés un pedido abierto, podés actualizar cómo lo vas a pagar.'}
          </p>

          <CollectionReceipt payment={collectionPayment} />
          <CollectionMethods restaurantId={currentRestaurantId ? String(currentRestaurantId) : null} disabled={enviando || !hayItemsEnCarrito} onChoose={method => { void crearPedidoDesdeCarrito(method === 'efectivo' ? 'efectivo' : 'virtual', method); }} />

          <p className="text-xs text-slate-500">
            {hayItemsEnCarrito
              ? 'Según cómo opere el local, tu pedido puede ir directo a cocina o pasar primero por validación del salón.'
              : 'El local verá tu elección en el sistema. Si algo no funciona, avisá al personal 😊'}
          </p>
        </section>
      </div>
        </main>
  );
}

export default function MesaPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          <p>Cargando menú...</p>
        </main>
      }
    >
      <MesaPageContent />
    </Suspense>
  );
}
