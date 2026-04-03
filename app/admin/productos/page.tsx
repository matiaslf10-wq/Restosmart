'use client';

import { useEffect, useState } from 'react';

type Producto = {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  categoria: string | null;
  disponible: boolean | null;
  imagen_url?: string | null;
};

type FormProducto = {
  id?: number | null;
  nombre: string;
  descripcion: string;
  precio: string;
  categoria: string;
  disponible: boolean;
  imagen_url: string;
};

const CATEGORIAS = [
  { value: 'comida', label: 'Comidas' },
  { value: 'bebida', label: 'Bebidas' },
  { value: 'cafeteria', label: 'Cafetería' },
  { value: 'postre', label: 'Postres' },
];

export default function AdminProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas');
  const [busqueda, setBusqueda] = useState('');

  const [form, setForm] = useState<FormProducto>({
    id: null,
    nombre: '',
    descripcion: '',
    precio: '',
    categoria: 'comida',
    disponible: true,
    imagen_url: '',
  });

  const [modoEdicion, setModoEdicion] = useState(false);

  const cargarProductos = async () => {
    setCargando(true);
    setMensaje(null);

    try {
      const res = await fetch('/api/productos', { cache: 'no-store' });

      if (!res.ok) {
        throw new Error('No se pudieron cargar los productos.');
      }

      const data = (await res.json()) as Producto[];
      setProductos(data ?? []);
    } catch (error) {
      console.error('Error cargando productos:', error);
      setMensaje('No se pudieron cargar los productos.');
      setProductos([]);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarProductos();
  }, []);

  const resetForm = () => {
    setForm({
      id: null,
      nombre: '',
      descripcion: '',
      precio: '',
      categoria: 'comida',
      disponible: true,
      imagen_url: '',
    });
    setModoEdicion(false);
  };

  const onChangeForm = (field: keyof FormProducto, value: string | boolean) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const comenzarEdicion = (p: Producto) => {
    setModoEdicion(true);
    setForm({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion ?? '',
      precio: String(p.precio),
      categoria: p.categoria ?? 'comida',
      disponible: !!p.disponible,
      imagen_url: p.imagen_url ?? '',
    });
  };

  const guardarProducto = async () => {
    setGuardando(true);
    setMensaje(null);

    const precioNumber = parseFloat(form.precio.replace(',', '.'));

    if (isNaN(precioNumber)) {
      setMensaje('El precio debe ser un número válido.');
      setGuardando(false);
      return;
    }

    const payload = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      precio: precioNumber,
      categoria: form.categoria,
      disponible: form.disponible,
      imagen_url: form.imagen_url.trim() || null,
    };

    if (!payload.nombre) {
      setMensaje('El nombre es obligatorio.');
      setGuardando(false);
      return;
    }

    try {
      if (modoEdicion && form.id) {
        const res = await fetch(`/api/productos/${form.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error('No se pudo actualizar el producto.');
        }

        const data = (await res.json()) as Producto;

        setProductos((prev) =>
          prev.map((p) => (p.id === form.id ? data : p))
        );

        setMensaje('Producto actualizado correctamente.');
      } else {
        const res = await fetch('/api/productos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error('No se pudo crear el producto.');
        }

        const data = (await res.json()) as Producto;
        setProductos((prev) => [...prev, data]);
        setMensaje('Producto creado correctamente.');
      }

      resetForm();
    } catch (error) {
      console.error('Error guardando producto:', error);
      setMensaje(
        modoEdicion
          ? 'No se pudo actualizar el producto.'
          : 'No se pudo crear el producto.'
      );
    } finally {
      setGuardando(false);
    }
  };

  const eliminarProducto = async (id: number) => {
    const prod = productos.find((p) => p.id === id);
    if (!prod) return;

    if (
      !window.confirm(
        `¿Eliminar "${prod.nombre}"? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    setEliminandoId(id);
    setMensaje(null);

    try {
      const res = await fetch(`/api/productos/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('No se pudo eliminar el producto.');
      }

      setProductos((prev) => prev.filter((p) => p.id !== id));
      setMensaje('Producto eliminado correctamente.');
    } catch (error) {
      console.error('Error eliminando producto:', error);
      setMensaje('No se pudo eliminar el producto.');
    } finally {
      setEliminandoId(null);
    }
  };

  const toggleDisponible = async (p: Producto) => {
    const nuevoEstado = !p.disponible;
    setMensaje(null);

    try {
      const res = await fetch(`/api/productos/${p.id}/disponible`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ disponible: nuevoEstado }),
});

      if (!res.ok) {
        throw new Error('No se pudo cambiar la disponibilidad.');
      }

      const data = (await res.json()) as Producto;

      setProductos((prev) =>
        prev.map((prod) => (prod.id === p.id ? data : prod))
      );
    } catch (error) {
      console.error('Error cambiando disponibilidad:', error);
      setMensaje('No se pudo cambiar la disponibilidad.');
    }
  };

  const productosFiltrados = productos.filter((p) => {
    const coincideCategoria =
      filtroCategoria === 'todas' ||
      (p.categoria ?? 'todas') === filtroCategoria;

    const coincideBusqueda =
      !busqueda.trim() ||
      p.nombre.toLowerCase().includes(busqueda.toLowerCase());

    return coincideCategoria && coincideBusqueda;
  });

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">Menú / Productos</h1>
        <button
          onClick={cargarProductos}
          className="px-3 py-1 rounded-lg text-sm bg-slate-800 text-white hover:bg-slate-700"
        >
          Actualizar lista
        </button>
      </section>

      {mensaje && (
        <p className="text-sm text-slate-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg">
          {mensaje}
        </p>
      )}

      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {modoEdicion ? 'Editar producto' : 'Nuevo producto'}
          </h2>
          {modoEdicion && (
            <button
              onClick={resetForm}
              className="text-xs text-slate-600 underline"
            >
              Cancelar edición
            </button>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-700">
              Nombre
            </label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.nombre}
              onChange={(e) => onChangeForm('nombre', e.target.value)}
              placeholder="Ej: Milanesa con papas fritas"
            />

            <label className="block text-xs font-medium text-slate-700 mt-2">
              Descripción
            </label>
            <textarea
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.descripcion}
              onChange={(e) => onChangeForm('descripcion', e.target.value)}
              placeholder="Detalle corto del plato, ingredientes, etc."
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-700">
              Precio
            </label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.precio}
              onChange={(e) => onChangeForm('precio', e.target.value)}
              placeholder="Ej: 4500"
            />

            <label className="block text-xs font-medium text-slate-700 mt-2">
              Categoría
            </label>
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.categoria}
              onChange={(e) => onChangeForm('categoria', e.target.value)}
            >
              {CATEGORIAS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>

            <label className="block text-xs font-medium text-slate-700 mt-2">
              URL de imagen
            </label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.imagen_url}
              onChange={(e) => onChangeForm('imagen_url', e.target.value)}
              placeholder="https://..."
            />

            {form.imagen_url && (
              <div className="mt-3">
                <p className="text-xs text-slate-600 mb-1">Vista previa:</p>
                <img
                  src={form.imagen_url}
                  alt="Vista previa"
                  className="w-32 h-32 object-cover rounded-lg border"
                />
                <p className="text-xs text-slate-500 mt-1 break-all">
                  {form.imagen_url}
                </p>
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <input
                id="disponible"
                type="checkbox"
                checked={form.disponible}
                onChange={(e) => onChangeForm('disponible', e.target.checked)}
              />
              <label htmlFor="disponible" className="text-xs text-slate-700">
                Mostrar en el menú de las mesas
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={guardarProducto}
            disabled={guardando}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
          >
            {guardando
              ? 'Guardando...'
              : modoEdicion
              ? 'Guardar cambios'
              : 'Crear producto'}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              onClick={() => setFiltroCategoria('todas')}
              className={`px-3 py-1 rounded-full border ${
                filtroCategoria === 'todas'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300'
              }`}
            >
              Todas
            </button>

            {CATEGORIAS.map((c) => (
              <button
                key={c.value}
                onClick={() => setFiltroCategoria(c.value)}
                className={`px-3 py-1 rounded-full border ${
                  filtroCategoria === c.value
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="flex-1 min-w-[180px]">
            <input
              type="text"
              placeholder="Buscar por nombre..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>

        {cargando && <p>Cargando productos...</p>}

        {!cargando && productosFiltrados.length === 0 && (
          <p className="text-sm text-slate-600">
            No hay productos que coincidan con el filtro actual.
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {productosFiltrados.map((p) => {
            const catLabel =
              CATEGORIAS.find((c) => c.value === p.categoria)?.label ??
              p.categoria ??
              'Sin categoría';

            return (
              <article
                key={p.id}
                className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col gap-2"
              >
                <div className="flex items-start gap-3">
                  {p.imagen_url && (
                    <img
                      src={p.imagen_url}
                      alt={p.nombre}
                      className="w-16 h-16 rounded-lg object-cover border border-slate-200"
                    />
                  )}

                  <div className="flex-1">
                    <div className="flex justify-between gap-2">
                      <h3 className="font-semibold text-slate-900">
                        {p.nombre}
                      </h3>
                      <span className="text-sm font-bold">
                        ${p.precio}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500">{catLabel}</p>

                    {p.descripcion && (
                      <p className="mt-1 text-sm text-slate-700 line-clamp-2">
                        {p.descripcion}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 mt-1">
                  <button
                    onClick={() => toggleDisponible(p)}
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      p.disponible
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {p.disponible ? 'Visible en menú' : 'Oculto'}
                  </button>

                  <div className="flex gap-2">
                    <button
                      onClick={() => comenzarEdicion(p)}
                      className="px-2 py-1 rounded-md bg-slate-100 border border-slate-300 text-xs hover:bg-slate-200"
                    >
                      Editar
                    </button>

                    <button
                      onClick={() => eliminarProducto(p.id)}
                      disabled={eliminandoId === p.id}
                      className="px-2 py-1 rounded-md bg-rose-100 text-rose-700 border border-rose-200 text-xs hover:bg-rose-200 disabled:opacity-60"
                    >
                      {eliminandoId === p.id ? 'Eliminando...' : 'Eliminar'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}