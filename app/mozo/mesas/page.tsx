'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type ItemPedido = {
  id: number;
  cantidad: number;
  comentarios: string | null;
  producto: {
    nombre: string;
    precio: number | null;
  } | null;
};

type Pedido = {
  id: number;
  mesa_id: number;
  creado_en: string;
  estado: string;
  paga_efectivo?: boolean;
  forma_pago?: 'efectivo' | 'virtual' | null;
  origen?: string | null;
  tipo_servicio?: string | null;
  medio_pago?: string | null;
  estado_pago?: string | null;
  efectivo_aprobado?: boolean | null;
  items: ItemPedido[];
};

type MesaConCuenta = {
  id: number;
  numero: number | null;
  nombre: string;
  pedidos: Pedido[];
  totalMesa: number;
};

type EstadoMesa = 'libre' | 'en_curso' | 'lista_para_cobrar';
type FiltroMesas = 'todas' | EstadoMesa;
type FormaPagoMesa = 'ninguna' | 'efectivo' | 'virtual';

function esPedidoDelivery(pedido: Pedido) {
  return (
    pedido.origen === 'delivery' ||
    pedido.origen === 'delivery_whatsapp' ||
    pedido.origen === 'delivery_manual' ||
    pedido.tipo_servicio === 'delivery'
  );
}

function shouldShowPedidoInMozo(pedido: Pedido) {
  return !esPedidoDelivery(pedido);
}

function esMesaTecnica(mesa: { numero: number | null }) {
  return mesa.numero == null;
}

function getNextMesaNumero(mesas: Array<{ numero: number | null }>) {
  const usados = new Set(
    mesas
      .map((m) => m.numero)
      .filter((n): n is number => typeof n === 'number' && n > 0)
  );

  let candidato = 1;
  while (usados.has(candidato)) {
    candidato += 1;
  }

  return candidato;
}

export default function MesasMozoPage() {
  const [mesas, setMesas] = useState<MesaConCuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesandoMesaId, setProcesandoMesaId] = useState<number | null>(null);
  const [eliminandoMesaId, setEliminandoMesaId] = useState<number | null>(null);
  const [actualizandoPedidoId, setActualizandoPedidoId] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [agregandoMesa, setAgregandoMesa] = useState(false);
  const [filtroMesas, setFiltroMesas] = useState<FiltroMesas>('todas');

  const [ahora, setAhora] = useState<number>(Date.now());

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setAhora(Date.now());
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const cargarDatos = async () => {
    setCargando(true);
    setMensaje(null);

    try {
      const { data: mesasData, error: errorMesas } = await supabase
        .from('mesas')
        .select('*')
        .order('id', { ascending: true });

      if (errorMesas) {
        console.error('Error al cargar mesas:', errorMesas);
        setMensaje('Error al cargar las mesas.');
        setCargando(false);
        return;
      }

      if (!mesasData) {
        setMesas([]);
        setCargando(false);
        return;
      }

      const { data: pedidosData, error: errorPedidos } = await supabase
        .from('pedidos')
        .select(`
          id,
          mesa_id,
          creado_en,
          estado,
          paga_efectivo,
          forma_pago,
          origen,
          tipo_servicio,
          medio_pago,
          estado_pago,
          efectivo_aprobado,
          items_pedido (
            id,
            cantidad,
            comentarios,
            producto:productos ( nombre, precio )
          )
        `)
        .in('estado', ['solicitado', 'pendiente', 'en_preparacion', 'listo']);

      if (errorPedidos) {
        console.error('Error al cargar pedidos:', errorPedidos);
        setMensaje('Error al cargar los pedidos.');
        setCargando(false);
        return;
      }

      const pedidosBase: any[] = pedidosData ?? [];

      const pedidosPorMesa: Record<number, Pedido[]> = {};
      pedidosBase.forEach((p) => {
        const pedido: Pedido = {
          id: p.id,
          mesa_id: p.mesa_id,
          creado_en: p.creado_en,
          estado: p.estado,
          paga_efectivo: p.paga_efectivo,
          forma_pago: p.forma_pago,
          origen: p.origen ?? null,
          tipo_servicio: p.tipo_servicio ?? null,
          medio_pago: p.medio_pago ?? null,
          estado_pago: p.estado_pago ?? null,
          efectivo_aprobado: p.efectivo_aprobado ?? null,
          items: p.items_pedido ?? [],
        };

        if (!shouldShowPedidoInMozo(pedido)) {
          return;
        }

        if (!pedidosPorMesa[pedido.mesa_id]) {
          pedidosPorMesa[pedido.mesa_id] = [];
        }

        pedidosPorMesa[pedido.mesa_id].push(pedido);
      });

      const mesasConCuenta: MesaConCuenta[] = (mesasData as any[])
        .map((m) => {
          const pedidosMesa = pedidosPorMesa[m.id] ?? [];

          const totalMesa = pedidosMesa.reduce((acc, p) => {
            const subtotal = p.items.reduce((accItem, item) => {
              const precio = item.producto?.precio ?? 0;
              return accItem + precio * item.cantidad;
            }, 0);
            return acc + subtotal;
          }, 0);

          return {
            id: m.id,
            numero: m.numero ?? null,
            nombre: m.nombre as string,
            pedidos: pedidosMesa,
            totalMesa,
          };
        })
        .filter((mesa) => !esMesaTecnica(mesa))
        .sort((a, b) => (a.numero ?? 999999) - (b.numero ?? 999999));

      setMesas(mesasConCuenta);
    } catch (err) {
      console.error('Error inesperado en cargarDatos:', err);
      setMensaje('Ocurrió un error inesperado al cargar los datos.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();

    const canalPedidos = supabase
      .channel('mozo-pedidos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos' },
        (payload) => {
          const nuevo: any = payload.new;
          const viejo: any = payload.old;

          if (
            payload.eventType === 'INSERT' &&
            nuevo.estado === 'solicitado' &&
            nuevo.origen !== 'delivery' &&
            nuevo.origen !== 'delivery_whatsapp' &&
            nuevo.origen !== 'delivery_manual' &&
            nuevo.tipo_servicio !== 'delivery'
          ) {
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch(() => {});
            }
          }

          if (
            payload.eventType === 'UPDATE' &&
            viejo?.estado !== 'listo' &&
            nuevo?.estado === 'listo' &&
            nuevo?.origen !== 'delivery' &&
            nuevo?.origen !== 'delivery_whatsapp' &&
            nuevo?.origen !== 'delivery_manual' &&
            nuevo?.tipo_servicio !== 'delivery'
          ) {
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch(() => {});
            }
          }

          const esSalon =
            nuevo?.origen !== 'delivery' &&
            nuevo?.origen !== 'delivery_whatsapp' &&
            nuevo?.origen !== 'delivery_manual' &&
            nuevo?.tipo_servicio !== 'delivery';

          const pagoAntes = viejo?.paga_efectivo || viejo?.forma_pago === 'efectivo';
          const pagoDespues = nuevo?.paga_efectivo || nuevo?.forma_pago === 'efectivo';

          if (esSalon && !pagoAntes && pagoDespues) {
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch(() => {});
            }
          }

          cargarDatos();
        }
      )
      .subscribe();

    const canalItems = supabase
      .channel('mozo-items')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items_pedido' },
        () => {
          cargarDatos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalPedidos);
      supabase.removeChannel(canalItems);
    };
  }, []);

  const calcularEstadoMesa = (mesa: MesaConCuenta): EstadoMesa => {
    if (mesa.pedidos.length === 0) return 'libre';

    const hayEnCurso = mesa.pedidos.some(
      (p) =>
        p.estado === 'solicitado' ||
        p.estado === 'pendiente' ||
        p.estado === 'en_preparacion'
    );
    if (hayEnCurso) return 'en_curso';

    return 'lista_para_cobrar';
  };

  const formaPagoMesa = (mesa: MesaConCuenta): FormaPagoMesa => {
    if (
      mesa.pedidos.some(
        (p) =>
          p.forma_pago === 'efectivo' ||
          p.paga_efectivo ||
          p.medio_pago === 'efectivo'
      )
    ) {
      return 'efectivo';
    }
    if (
      mesa.pedidos.some(
        (p) => p.forma_pago === 'virtual' || p.medio_pago === 'virtual'
      )
    ) {
      return 'virtual';
    }
    return 'ninguna';
  };

  const clasesMesaPorEstado = (estado: EstadoMesa) => {
    switch (estado) {
      case 'libre':
        return 'border-slate-200 bg-white';
      case 'en_curso':
        return 'border-amber-400 bg-amber-50';
      case 'lista_para_cobrar':
        return 'border-emerald-500 bg-emerald-50';
    }
  };

  const badgeMesaPorEstado = (estado: EstadoMesa) => {
    switch (estado) {
      case 'libre':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 text-slate-800 px-2 py-[2px] text-[11px] font-medium">
            <span className="inline-block w-2 h-2 rounded-full bg-slate-500" />
            Libre
          </span>
        );
      case 'en_curso':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-200 text-amber-900 px-2 py-[2px] text-[11px] font-medium">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
            En curso
          </span>
        );
      case 'lista_para_cobrar':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-200 text-emerald-900 px-2 py-[2px] text-[11px] font-medium">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            Lista para cobrar
          </span>
        );
    }
  };

  const tiempoMesa = (mesa: MesaConCuenta): string | null => {
    if (mesa.pedidos.length === 0) return null;
    const tiempos = mesa.pedidos.map((p) => new Date(p.creado_en).getTime());
    const primero = Math.min(...tiempos);
    const diffMs = ahora - primero;
    if (diffMs <= 0) return null;

    const diffMin = Math.floor(diffMs / 60000);
    const horas = Math.floor(diffMin / 60);
    const mins = diffMin % 60;

    if (horas === 0) return `Hace ${diffMin} min`;
    return `Hace ${horas} h ${mins} min`;
  };

  const resumenCantidades = (mesa: MesaConCuenta): string => {
    const cantidadPedidos = mesa.pedidos.length;
    const cantidadItems = mesa.pedidos.reduce(
      (acc, p) => acc + p.items.length,
      0
    );
    return `${cantidadPedidos} pedido${cantidadPedidos !== 1 ? 's' : ''} · ${cantidadItems} ítem${cantidadItems !== 1 ? 's' : ''}`;
  };

  const cerrarCuentaMesa = async (mesaId: number) => {
    const mesa = mesas.find((m) => m.id === mesaId);
    if (!mesa) return;

    if (mesa.pedidos.length === 0) {
      setMensaje(`La mesa ${mesa.nombre} no tiene pedidos abiertos.`);
      return;
    }

    const confirmar = window.confirm(`¿Cerrar la cuenta de ${mesa.nombre}?`);
    if (!confirmar) return;

    setProcesandoMesaId(mesaId);
    setMensaje(null);

    const ids = mesa.pedidos.map((p) => p.id);

    const { error } = await supabase
      .from('pedidos')
      .update({ estado: 'cerrado' })
      .in('id', ids);

    if (error) {
      console.log('cerrarCuentaMesa error.message:', (error as any)?.message);
      console.log('cerrarCuentaMesa error.code:', (error as any)?.code);
      console.log('cerrarCuentaMesa error.details:', (error as any)?.details);
      console.log('cerrarCuentaMesa error.hint:', (error as any)?.hint);
      console.log('cerrarCuentaMesa error raw:', error);
      setMensaje(
        `No se pudo cerrar la cuenta: ${(error as any)?.message ?? 'Error desconocido'}`
      );
      setProcesandoMesaId(null);
      return;
    }

    setMensaje(`Cuenta de ${mesa.nombre} cerrada correctamente.`);
    setProcesandoMesaId(null);
    cargarDatos();
  };

  const agregarMesa = async () => {
    setAgregandoMesa(true);
    setMensaje(null);

    try {
      const { data: mesasExistentes, error: errorMesas } = await supabase
        .from('mesas')
        .select('id, numero');

      if (errorMesas) {
        console.error(errorMesas);
        setMensaje('No se pudo calcular el próximo número de mesa.');
        setAgregandoMesa(false);
        return;
      }

      const proximoNumero = getNextMesaNumero((mesasExistentes as Array<{ id: number; numero: number | null }>) ?? []);

      const payload = {
        numero: proximoNumero,
        nombre: `Mesa ${proximoNumero}`,
      };

      const { data, error } = await supabase
        .from('mesas')
        .insert(payload)
        .select()
        .single();

      if (error || !data) {
        console.error(error);
        setMensaje('No se pudo agregar una nueva mesa.');
        setAgregandoMesa(false);
        return;
      }

      setMensaje(`Se agregó Mesa ${proximoNumero}.`);
      setAgregandoMesa(false);
      cargarDatos();
    } catch (error) {
      console.error(error);
      setMensaje('Ocurrió un error al agregar la mesa.');
      setAgregandoMesa(false);
    }
  };

  const eliminarMesa = async (mesaId: number) => {
    const mesa = mesas.find((m) => m.id === mesaId);
    if (!mesa) return;

    setEliminandoMesaId(mesaId);
    setMensaje(null);

    const { count, error: countError } = await supabase
      .from('pedidos')
      .select('*', { count: 'exact', head: true })
      .eq('mesa_id', mesaId);

    if (countError) {
      console.error(countError);
      setMensaje('No se pudo verificar si la mesa tiene pedidos asociados.');
      setEliminandoMesaId(null);
      return;
    }

    if ((count ?? 0) > 0) {
      setMensaje(
        `No se puede eliminar ${mesa.nombre} porque tiene pedidos asociados en el historial.`
      );
      setEliminandoMesaId(null);
      return;
    }

    const confirmar = window.confirm(
      `¿Eliminar ${mesa.nombre}? Esta acción no se puede deshacer.`
    );
    if (!confirmar) {
      setEliminandoMesaId(null);
      return;
    }

    const { error } = await supabase
      .from('mesas')
      .delete()
      .eq('id', mesaId);

    if (error) {
      console.error(error);
      setMensaje(
        `No se pudo eliminar la mesa: ${(error as any)?.message ?? 'Error desconocido'}`
      );
      setEliminandoMesaId(null);
      return;
    }

    setMensaje(`${mesa.nombre} fue eliminada.`);
    setEliminandoMesaId(null);
    cargarDatos();
  };

  const cancelarPedido = async (pedidoId: number) => {
    const confirmar = window.confirm(
      '¿Cancelar este pedido? Se tomará como pedido arrepentido.'
    );
    if (!confirmar) return;

    setMensaje(null);

    const { error } = await supabase
      .from('pedidos')
      .update({ estado: 'cancelado' })
      .eq('id', pedidoId);

    if (error) {
      console.error(error);
      setMensaje('No se pudo cancelar el pedido.');
      return;
    }

    setMensaje('Pedido cancelado correctamente.');
    cargarDatos();
  };

  const actualizarEstadoPedido = async (pedidoId: number, nuevoEstado: string) => {
    setActualizandoPedidoId(pedidoId);
    setMensaje(null);

    const { error } = await supabase
      .from('pedidos')
      .update({ estado: nuevoEstado })
      .eq('id', pedidoId);

    if (error) {
      console.error('Error al actualizar estado del pedido:', error);
      setMensaje('No se pudo actualizar el estado del pedido.');
      setActualizandoPedidoId(null);
      return;
    }

    setActualizandoPedidoId(null);
    cargarDatos();
  };

  const mesasFiltradas = mesas.filter((mesa) => {
    if (filtroMesas === 'todas') return true;
    return calcularEstadoMesa(mesa) === filtroMesas;
  });

  const resumenEstados = mesas.reduce(
    (acc, mesa) => {
      const estado = calcularEstadoMesa(mesa);
      acc[estado]++;
      return acc;
    },
    { libre: 0, en_curso: 0, lista_para_cobrar: 0 }
  );

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6">
      <audio
        ref={audioRef}
        src="/sounds/mozo.wav"
        preload="auto"
        className="hidden"
      />

      <div className="max-w-6xl mx-auto space-y-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Mesas – Vista de mozo</h1>
            <p className="text-sm text-slate-600">
              Todas las mesas del salón en simultáneo.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={cargarDatos}
              className="px-3 py-1 rounded-lg text-sm bg-slate-800 text-white hover:bg-slate-700"
            >
              Actualizar
            </button>
            <button
              onClick={agregarMesa}
              disabled={agregandoMesa}
              className="px-3 py-1 rounded-lg text-sm bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-60"
            >
              {agregandoMesa ? 'Agregando...' : 'Agregar mesa'}
            </button>
          </div>
        </header>

        <div className="flex flex-wrap gap-3 text-sm bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
          <span>Libres: {resumenEstados.libre}</span>
          <span>En curso: {resumenEstados.en_curso}</span>
          <span>Listas para cobrar: {resumenEstados.lista_para_cobrar}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { value: 'todas', label: 'Todas' },
            { value: 'libre', label: 'Libres' },
            { value: 'en_curso', label: 'En curso' },
            { value: 'lista_para_cobrar', label: 'Listas para cobrar' },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setFiltroMesas(f.value as FiltroMesas)}
              className={`px-3 py-1 rounded-full text-xs border ${
                filtroMesas === f.value
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {mensaje && (
          <p className="text-sm text-slate-700 bg-yellow-50 border border-yellow-300 px-3 py-2 rounded-lg">
            {mensaje}
          </p>
        )}

        {cargando && <p>Cargando datos de mesas...</p>}

        {!cargando && mesasFiltradas.length === 0 && (
          <p className="text-slate-600">
            No hay mesas que coincidan con el filtro seleccionado.
          </p>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {mesasFiltradas.map((mesa) => {
            const estado = calcularEstadoMesa(mesa);
            const clasesEstado = clasesMesaPorEstado(estado);
            const tiempo = tiempoMesa(mesa);
            const resumen = resumenCantidades(mesa);
            const formaPago = formaPagoMesa(mesa);

            return (
              <article
                key={mesa.id}
                className={`border rounded-xl px-4 py-3 shadow-sm flex flex-col h-full ${clasesEstado}`}
              >
                <header className="flex items-baseline justify-between gap-2 mb-1">
                  <div>
                    <h2 className="font-bold text-slate-900">
                      {mesa.numero != null ? `Mesa ${mesa.numero}` : mesa.nombre}
                    </h2>
                    <span className="text-[11px] text-slate-500">
                      ID interno {mesa.id}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {badgeMesaPorEstado(estado)}
                    {formaPago === 'efectivo' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-700 text-emerald-50 px-2 py-[2px] text-[11px] font-medium">
                        💵 Paga en efectivo
                      </span>
                    )}
                    {formaPago === 'virtual' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-700 text-indigo-50 px-2 py-[2px] text-[11px] font-medium">
                        💳 Pago virtual
                      </span>
                    )}
                  </div>
                </header>

                <div className="text-xs text-slate-600 flex justify-between items-center mb-1">
                  <span>{resumen}</span>
                  {tiempo && <span>{tiempo}</span>}
                </div>

                {mesa.pedidos.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-600">
                    Sin pedidos abiertos.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2 text-sm">
                    {mesa.pedidos.map((p) => (
                      <div
                        key={p.id}
                        className="border border-slate-200 rounded-lg px-2 py-1 bg-white/70"
                      >
                        <div className="flex justify-between items-baseline gap-2">
                          <span className="font-semibold">Pedido #{p.id}</span>
                          <span className="text-[11px] text-slate-500">
                            {new Date(p.creado_en).toLocaleTimeString()} ·{' '}
                            {p.estado === 'solicitado'
                              ? 'Esperando confirmación del mozo'
                              : p.estado === 'pendiente'
                              ? 'Pendiente'
                              : p.estado === 'en_preparacion'
                              ? 'En preparación'
                              : 'Listo'}
                          </span>
                        </div>

                        <ul className="mt-1 space-y-[2px]">
                          {p.items.map((item) => (
                            <li key={item.id} className="flex flex-col">
                              <div className="flex justify-between">
                                <span>
                                  {item.cantidad} × {item.producto?.nombre ?? '—'}
                                </span>
                                <span>
                                  ${(item.producto?.precio ?? 0) * item.cantidad}
                                </span>
                              </div>
                              {item.comentarios && (
                                <span className="text-[11px] text-slate-600 ml-3">
                                  Nota: {item.comentarios}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>

                        <div className="mt-2 flex flex-wrap justify-between gap-2 items-center">
                          <div className="flex flex-wrap gap-2">
                            {p.estado === 'solicitado' && (
                              <button
                                onClick={() =>
                                  actualizarEstadoPedido(p.id, 'pendiente')
                                }
                                disabled={actualizandoPedidoId === p.id}
                                className="px-2 py-1 rounded-md bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700 disabled:opacity-60"
                              >
                                {actualizandoPedidoId === p.id
                                  ? 'Actualizando...'
                                  : 'Enviar a cocina'}
                              </button>
                            )}

                            {p.estado === 'en_preparacion' && (
                              <button
                                onClick={() =>
                                  actualizarEstadoPedido(p.id, 'listo')
                                }
                                disabled={actualizandoPedidoId === p.id}
                                className="px-2 py-1 rounded-md bg-indigo-600 text-white text-[11px] font-medium hover:bg-indigo-700 disabled:opacity-60"
                              >
                                {actualizandoPedidoId === p.id
                                  ? 'Actualizando...'
                                  : 'Marcar listo'}
                              </button>
                            )}
                          </div>

                          <button
                            onClick={() => cancelarPedido(p.id)}
                            className="px-2 py-1 rounded-md bg-rose-100 text-rose-700 text-[11px] font-medium hover:bg-rose-200"
                          >
                            Cancelar pedido
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <footer className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">Total: ${mesa.totalMesa}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => cerrarCuentaMesa(mesa.id)}
                      disabled={
                        mesa.pedidos.length === 0 ||
                        procesandoMesaId === mesa.id
                      }
                      className="px-3 py-1 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-60"
                    >
                      {procesandoMesaId === mesa.id
                        ? 'Cerrando...'
                        : 'Cerrar cuenta'}
                    </button>
                    <button
                      onClick={() => eliminarMesa(mesa.id)}
                      disabled={eliminandoMesaId === mesa.id}
                      className="px-3 py-1 rounded-lg bg-slate-300 text-slate-800 text-xs font-semibold hover:bg-slate-400 disabled:opacity-60"
                    >
                      {eliminandoMesaId === mesa.id
                        ? 'Eliminando...'
                        : 'Eliminar mesa'}
                    </button>
                  </div>
                </footer>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}