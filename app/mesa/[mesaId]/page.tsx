'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Producto = {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  categoria: string | null;
  imagen_url: string | null;
};

type ItemCarrito = {
  producto: Producto;
  cantidad: number;
  comentarios: string;
};

export default function MesaPage() {
  const params = useParams();
  const rawMesaId = params?.mesaId as string | string[] | undefined;
  const mesaId = Number(Array.isArray(rawMesaId) ? rawMesaId[0] : rawMesaId);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string | null>(null);

  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [procesandoPago, setProcesandoPago] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cargar productos
  useEffect(() => {
    const cargarProductos = async () => {
      setCargando(true);
      const { data, error } = await supabase
  .from('productos')
  .select('*')
  .eq('disponible', true)
  .order('categoria', { ascending: true })
  .order('nombre', { ascending: true });

      if (error) {
        console.error('Error cargando productos:', error);
      } else {
        const lista = (data as Producto[]) ?? [];
        setProductos(lista);

        const cats = Array.from(
          new Set(
            lista
              .map((p) => p.categoria)
              .filter((c): c is string => !!c && c.trim() !== '')
          )
        ).sort((a, b) => a.localeCompare(b));

        setCategorias(cats);
        setCategoriaSeleccionada(null);
      }
      setCargando(false);
    };

    cargarProductos();
  }, []);

  // Suscripción: cambios de estado del pedido de ESTA mesa
  useEffect(() => {
    if (!mesaId || Number.isNaN(mesaId)) return;

    const channel = supabase
      .channel(`mesa-${mesaId}-notifs-cliente`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pedidos',
          filter: `mesa_id=eq.${mesaId}`,
        },
        (payload) => {
          const nuevo: any = payload.new;
          const viejo: any = payload.old;

          if (viejo?.estado !== 'en_preparacion' && nuevo?.estado === 'en_preparacion') {
            setMensaje('Tu pedido está en preparación 🍳');
          }

          if (viejo?.estado !== 'listo' && nuevo?.estado === 'listo') {
            setMensaje('¡Tu pedido ya está listo! Podés acercarte a retirarlo. 🍽️');

            if (audioRef.current) {
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch((err) =>
                console.log('No se pudo reproducir el sonido:', err)
              );
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [mesaId]);

  const agregarAlCarrito = (producto: Producto) => {
    setCarrito((prev) => {
      const existente = prev.find((i) => i.producto.id === producto.id);
      if (existente) {
        return prev.map((i) =>
          i.producto.id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i
        );
      }
      return [...prev, { producto, cantidad: 1, comentarios: '' }];
    });
  };

  const cambiarCantidad = (productoId: number, cantidad: number) => {
    if (cantidad <= 0) {
      setCarrito((prev) => prev.filter((i) => i.producto.id !== productoId));
    } else {
      setCarrito((prev) =>
        prev.map((i) => (i.producto.id === productoId ? { ...i, cantidad } : i))
      );
    }
  };

  const cambiarComentario = (productoId: number, texto: string) => {
    setCarrito((prev) =>
      prev.map((i) => (i.producto.id === productoId ? { ...i, comentarios: texto } : i))
    );
  };

  const total = carrito.reduce((acc, item) => acc + item.producto.precio * item.cantidad, 0);

  // Crea un pedido desde el carrito
  const crearPedidoDesdeCarrito = async (formaPago: 'virtual' | 'efectivo') => {
    if (!mesaId || Number.isNaN(mesaId)) return null;

    if (carrito.length === 0) {
      setMensaje('No hay productos en el pedido.');
      return null;
    }

    setEnviando(true);
    setMensaje(null);

    try {
      const { data: pedido, error: errorPedido } = await supabase
        .from('pedidos')
        .insert({
          mesa_id: mesaId,
          estado: 'solicitado',
          paga_efectivo: formaPago === 'efectivo',
          forma_pago: formaPago,
        })
        .select()
        .single();

      if (errorPedido || !pedido) {
        console.error('Error creando pedido:', errorPedido);
        setMensaje('Hubo un error al crear el pedido.');
        return null;
      }

      const items = carrito.map((item) => ({
        pedido_id: pedido.id,
        producto_id: item.producto.id,
        cantidad: item.cantidad,
        comentarios: item.comentarios || null,
      }));

      const { error: errorItems } = await supabase.from('items_pedido').insert(items);

      if (errorItems) {
        console.error('Error guardando ítems:', errorItems);
        setMensaje('Hubo un error al guardar los ítems del pedido.');
        return null;
      }

      setCarrito([]);
      return pedido;
    } finally {
      setEnviando(false);
    }
  };

  // 🔵 Cliente marca que PAGA EN EFECTIVO
  const marcarPagoEfectivoDesdeCliente = async () => {
    if (!mesaId || Number.isNaN(mesaId)) return;

    setProcesandoPago(true);
    setMensaje(null);

    try {
      if (carrito.length > 0) {
        const pedido = await crearPedidoDesdeCarrito('efectivo');
        if (!pedido) return;
        setMensaje('Pedido generado. Avisamos que vas a pagar en efectivo 💵');
      } else {
        const { error } = await supabase
          .from('pedidos')
          .update({
            paga_efectivo: true,
            forma_pago: 'efectivo',
          })
          .eq('mesa_id', mesaId)
          .in('estado', ['solicitado', 'pendiente', 'en_preparacion', 'listo']);

        if (error) {
          console.error('Error al marcar pago en efectivo desde cliente:', error);
          setMensaje('No se pudo marcar el pago en efectivo. Avisá al mozo.');
          return;
        }

        setMensaje('Listo, avisamos que vas a pagar en efectivo 💵');
      }
    } finally {
      setProcesandoPago(false);
    }
  };

  // 🟣 Cliente elige PAGO VIRTUAL
  const pagarVirtual = async () => {
    const urlPago = process.env.NEXT_PUBLIC_PAGO_VIRTUAL_URL || 'https://www.mercadopago.com.ar';

    setMensaje(null);

    if (mesaId && !Number.isNaN(mesaId)) {
      if (carrito.length > 0) {
        const pedido = await crearPedidoDesdeCarrito('virtual');
        if (!pedido) return;
        setMensaje('Pedido generado. Abrimos el pago virtual en una nueva ventana 💳');
      } else {
        // ✅ CORRECCIÓN: pago virtual NO es efectivo
        const { error } = await supabase
          .from('pedidos')
          .update({
            paga_efectivo: false,
            forma_pago: 'virtual',
          })
          .eq('mesa_id', mesaId)
          .in('estado', ['solicitado', 'pendiente', 'en_preparacion', 'listo']);

        if (error) {
          console.error('Error al marcar pago virtual desde cliente:', error);
          setMensaje('No se pudo marcar el pago virtual. Avisá al mozo.');
          return;
        }

        setMensaje('Abrimos el pago virtual en una nueva ventana 💳');
      }
    }

    if (urlPago) window.open(urlPago, '_blank');
  };

  if (!mesaId || Number.isNaN(mesaId)) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>Falta el número de mesa en la URL.</p>
      </main>
    );
  }

  const productosFiltrados =
    categoriaSeleccionada == null ? [] : productos.filter((p) => p.categoria === categoriaSeleccionada);

  if (cargando) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>Cargando menú...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center px-4 py-6">
      <audio ref={audioRef} src="/sounds/sonido.wav" preload="auto" className="hidden" />

      <div className="w-full max-w-lg space-y-4">
        <header className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Menú – Mesa {mesaId}</h1>
          {mensaje && (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg">
              {mensaje}
            </p>
          )}
        </header>

        {/* 1) CATEGORÍAS */}
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-center">Categorías</h2>
          {categorias.length === 0 && (
            <p className="text-sm text-slate-600 text-center">No hay categorías configuradas.</p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            {categorias.map((cat) => {
              const activa = categoriaSeleccionada === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoriaSeleccionada((prev) => (prev === cat ? null : cat))}
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
          <p className="text-xs text-slate-500 text-center">Elegí una categoría para ver los platos.</p>
        </section>

        {/* 2) LISTA DE PRODUCTOS */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Platos</h2>

          {categoriaSeleccionada == null && (
            <p className="text-sm text-slate-600">Todavía no seleccionaste una categoría.</p>
          )}

          {categoriaSeleccionada != null && productosFiltrados.length === 0 && (
            <p className="text-sm text-slate-600">No hay productos disponibles en esta categoría.</p>
          )}

          {categoriaSeleccionada != null && productosFiltrados.length > 0 && (
            <div className="space-y-3">
              {productosFiltrados.map((p) => (
                <article
                  key={p.id}
                  className="border border-slate-200 rounded-xl bg-white shadow-sm flex gap-3 overflow-hidden"
                >
                  <div className="w-24 h-24 bg-slate-100 flex-shrink-0">
                    {p.imagen_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imagen_url} alt={p.nombre} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 px-1 text-center">
                        Sin imagen
                      </div>
                    )}
                  </div>

                  <div className="flex-1 px-3 py-2 flex flex-col justify-between">
                    <div>
                      <h3 className="font-semibold">{p.nombre}</h3>
                      {p.descripcion && <p className="text-sm text-slate-600">{p.descripcion}</p>}
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <p className="font-bold">${p.precio}</p>
                      <button
                        className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
                        onClick={() => agregarAlCarrito(p)}
                      >
                        Agregar
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* CARRITO */}
        <section className="border-t border-slate-200 pt-4 space-y-3">
          <h2 className="text-xl font-semibold">Tu pedido</h2>
          {carrito.length === 0 && <p className="text-sm text-slate-600">El carrito está vacío.</p>}

          {carrito.map((item) => (
            <div
              key={item.producto.id}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm space-y-2"
            >
              <div className="flex justify-between items-start gap-2">
  <span className="font-medium">{item.producto.nombre}</span>

  <div className="flex items-center gap-2">
    <div className="flex items-center gap-1">
      <span className="text-sm">Cantidad:</span>
      <input
        type="number"
        min={1}
        value={item.cantidad}
        onChange={(e) => cambiarCantidad(item.producto.id, Number(e.target.value))}
        className="w-16 border border-slate-300 rounded px-1 text-sm"
      />
    </div>

    <button
      type="button"
      onClick={() => cambiarCantidad(item.producto.id, 0)}
      className="w-7 h-7 rounded-full bg-rose-100 text-rose-700 border border-rose-200 text-sm font-bold hover:bg-rose-200"
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
          ))}

          {carrito.length > 0 && (
            <div className="space-y-1">
              <p className="text-right text-lg font-bold">Total: ${total}</p>
              <p className="text-xs text-slate-500 text-right">
                Para enviar el pedido elegí una forma de pago abajo.
              </p>
            </div>
          )}
        </section>

        {/* FORMAS DE PAGO */}
        <section className="mt-4 border-t border-slate-200 pt-4 space-y-3">
          <h2 className="text-lg font-semibold">Formas de pago</h2>
          <p className="text-sm text-slate-600">Cuando quieras pagar la cuenta, elegí una opción:</p>

          <div className="flex flex-col gap-2">
            <button
              onClick={pagarVirtual}
              className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-60"
              disabled={enviando}
            >
              {enviando ? 'Generando pedido...' : 'Pago virtual (tarjeta / billetera)'}
            </button>

            <button
              onClick={marcarPagoEfectivoDesdeCliente}
              disabled={procesandoPago || enviando}
              className="w-full px-4 py-2 rounded-lg bg-emerald-700 text-emerald-50 font-semibold text-sm hover:bg-emerald-800 disabled:opacity-60"
            >
              {procesandoPago ? 'Marcando...' : 'Pagar en efectivo'}
            </button>
          </div>

          <p className="text-xs text-slate-500">
            El mozo verá tu elección en el sistema. Si algo no funciona, avisale 😊
          </p>
        </section>
      </div>
    </main>
  );
}
