'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatPlanLabel, type PlanCode } from '@/lib/plans';

type Marca = {
  id: string;
  tenant_id?: string | null;
  restaurant_id?: string | null;
  slug?: string | null;
  nombre: string;
  descripcion: string | null;
  logo_url?: string | null;
  color_hex?: string | null;
  activa: boolean | null;
  orden: number | null;
  creado_en?: string | null;
  actualizada_en?: string | null;
};

type AdminSessionPayload = {
  plan?: PlanCode;
  capabilities?: {
    multi_brand?: boolean;
  };
};

type FormMarca = {
  nombre: string;
  descripcion: string;
  logo_url: string;
  color_hex: string;
  activa: boolean;
  orden: string;
};

const initialForm: FormMarca = {
  nombre: '',
  descripcion: '',
  logo_url: '',
  color_hex: '',
  activa: true,
  orden: '0',
};

function normalizeIntegerInput(value: string) {
  return value.replace(/[^\d-]/g, '');
}

function isMarcaPrincipal(marca: Marca) {
  return marca.nombre.trim().toLowerCase() === 'marca principal';
}

export default function AdminMarcasPage() {
  const [plan, setPlan] = useState<PlanCode>('esencial');
  const [multiBrandEnabled, setMultiBrandEnabled] = useState(false);

  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormMarca>(initialForm);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const marcasActivas = useMemo(
    () => marcas.filter((marca) => marca.activa !== false),
    [marcas]
  );

  const marcasInactivas = useMemo(
    () => marcas.filter((marca) => marca.activa === false),
    [marcas]
  );

  const cargarSession = async () => {
    const res = await fetch('/api/admin/session', {
      method: 'GET',
      cache: 'no-store',
    });

    const raw = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(raw?.error || 'No se pudo cargar la sesión.');
    }

    const session = (raw?.session as AdminSessionPayload | null) ?? null;

    setPlan(session?.plan ?? 'esencial');
    setMultiBrandEnabled(!!session?.capabilities?.multi_brand);

    return !!session?.capabilities?.multi_brand;
  };

  const cargarMarcas = async () => {
    const res = await fetch('/api/admin/marcas', {
      method: 'GET',
      cache: 'no-store',
    });

    const raw = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(raw?.error || 'No se pudieron cargar las marcas.');
    }

    setMarcas((raw?.marcas as Marca[]) ?? []);
  };

  const cargarTodo = async () => {
    setCargando(true);
    setMensaje(null);
    setError(null);

    try {
      const enabled = await cargarSession();

      if (enabled) {
        await cargarMarcas();
      } else {
        setMarcas([]);
      }
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar la administración de marcas.'
      );
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarTodo();
  }, []);

  const resetForm = () => {
    setForm(initialForm);
    setEditandoId(null);
  };

  const comenzarEdicion = (marca: Marca) => {
    setEditandoId(marca.id);
    setForm({
      nombre: marca.nombre ?? '',
      descripcion: marca.descripcion ?? '',
      logo_url: marca.logo_url ?? '',
      color_hex: marca.color_hex ?? '',
      activa: marca.activa !== false,
      orden:
        marca.orden !== null && marca.orden !== undefined
          ? String(marca.orden)
          : '0',
    });
  };

  const guardarMarca = async () => {
    const nombre = form.nombre.trim();

    if (!nombre) {
      setError('El nombre de la marca es obligatorio.');
      return;
    }

    setGuardando(true);
    setMensaje(null);
    setError(null);

    const payload = {
      nombre,
      descripcion: form.descripcion.trim() || null,
      logo_url: form.logo_url.trim() || null,
      color_hex: form.color_hex.trim() || null,
      activa: form.activa,
      orden: Number(form.orden || 0),
    };

    try {
      const url = editandoId
        ? `/api/admin/marcas/${editandoId}`
        : '/api/admin/marcas';

      const res = await fetch(url, {
        method: editandoId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const raw = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          raw?.error ||
            (editandoId
              ? 'No se pudo actualizar la marca.'
              : 'No se pudo crear la marca.')
        );
      }

      setMensaje(editandoId ? 'Marca actualizada correctamente.' : 'Marca creada correctamente.');
      resetForm();
      await cargarMarcas();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : editandoId
          ? 'No se pudo actualizar la marca.'
          : 'No se pudo crear la marca.'
      );
    } finally {
      setGuardando(false);
    }
  };

  const alternarActiva = async (marca: Marca) => {
    setMensaje(null);
    setError(null);

    try {
      const res = await fetch(`/api/admin/marcas/${marca.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nombre: marca.nombre,
          descripcion: marca.descripcion,
          logo_url: marca.logo_url,
          color_hex: marca.color_hex,
          activa: marca.activa === false,
          orden: marca.orden ?? 0,
        }),
      });

      const raw = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(raw?.error || 'No se pudo cambiar el estado de la marca.');
      }

      setMensaje(
        marca.activa === false
          ? 'Marca activada correctamente.'
          : 'Marca desactivada correctamente.'
      );

      await cargarMarcas();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo cambiar el estado de la marca.'
      );
    }
  };

  const eliminarMarca = async (marca: Marca) => {
    if (isMarcaPrincipal(marca)) {
      setError('La Marca principal no se puede eliminar.');
      return;
    }

    const confirmar = window.confirm(
      `¿Eliminar la marca "${marca.nombre}"?\n\nSolo se puede eliminar si no tiene productos asignados.`
    );

    if (!confirmar) return;

    setEliminandoId(marca.id);
    setMensaje(null);
    setError(null);

    try {
      const res = await fetch(`/api/admin/marcas/${marca.id}`, {
        method: 'DELETE',
      });

      const raw = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(raw?.error || 'No se pudo eliminar la marca.');
      }

      setMensaje('Marca eliminada correctamente.');
      await cargarMarcas();

      if (editandoId === marca.id) {
        resetForm();
      }
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : 'No se pudo eliminar la marca.'
      );
    } finally {
      setEliminandoId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Marcas</h1>
          <p className="mt-1 text-sm text-slate-600">
            Plan actual: <strong>{formatPlanLabel(plan)}</strong>
          </p>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
            Administrá las marcas internas del local. En modo restaurante, las marcas
            quedan ocultas para clientes, cocina y mozo; solo aparecen como distintivo
            discreto en mostrador y como herramienta de gestión en Admin.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              void cargarTodo();
            }}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Actualizar
          </button>

          <Link
            href="/admin/productos"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Ir a productos
          </Link>
        </div>
      </section>

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

      {cargando ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-600 shadow-sm">
          Cargando marcas...
        </div>
      ) : null}

      {!cargando && !multiBrandEnabled ? (
        <section className="rounded-3xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
          <h2 className="text-lg font-semibold">Add-on Multimarca no activo</h2>
          <p className="mt-2 leading-relaxed">
            Este local todavía no tiene habilitada la administración de marcas.
            Activá el add-on <strong>multi_brand</strong> para este tenant desde Supabase.
          </p>
          <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 font-mono text-xs text-amber-950">
            tenant_addons · addon_key = multi_brand · enabled = true
          </p>
        </section>
      ) : null}

      {!cargando && multiBrandEnabled ? (
        <>
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {editandoId ? 'Editar marca' : 'Nueva marca'}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Estas marcas se usan para organizar productos y medir ventas sin
                  duplicar el local ni separar la operación.
                </p>
              </div>

              {editandoId ? (
                <button
                  onClick={resetForm}
                  className="text-sm text-slate-600 underline"
                >
                  Cancelar edición
                </button>
              ) : null}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">
                  Nombre de la marca
                </span>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, nombre: e.target.value }))
                  }
                  placeholder="Ej: Burger House"
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">
                  Orden
                </span>
                <input
                  type="text"
                  value={form.orden}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      orden: normalizeIntegerInput(e.target.value),
                    }))
                  }
                  placeholder="0"
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-2 md:col-span-2">
                <span className="text-sm font-medium text-slate-700">
                  Descripción
                </span>
                <textarea
                  value={form.descripcion}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      descripcion: e.target.value,
                    }))
                  }
                  placeholder="Descripción interna de la marca"
                  className="min-h-20 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">
                  Logo URL
                </span>
                <input
                  type="text"
                  value={form.logo_url}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, logo_url: e.target.value }))
                  }
                  placeholder="https://..."
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">
                  Color
                </span>
                <input
                  type="text"
                  value={form.color_hex}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, color_hex: e.target.value }))
                  }
                  placeholder="#10b981"
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="flex items-center gap-2 md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.activa}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      activa: e.target.checked,
                    }))
                  }
                />
                <span className="text-sm text-slate-700">Marca activa</span>
              </label>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => {
                  void guardarMarca();
                }}
                disabled={guardando}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {guardando
                  ? 'Guardando...'
                  : editandoId
                  ? 'Guardar cambios'
                  : 'Crear marca'}
              </button>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                Marcas activas
              </h2>

              {marcasActivas.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">
                  Todavía no hay marcas activas.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {marcasActivas.map((marca) => (
                    <article
                      key={marca.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-slate-900">
                              {marca.nombre}
                            </h3>

                            {isMarcaPrincipal(marca) ? (
                              <span className="rounded-full bg-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700">
                                Principal
                              </span>
                            ) : null}

                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-800">
                              Activa
                            </span>
                          </div>

                          {marca.descripcion ? (
                            <p className="mt-1 text-sm text-slate-600">
                              {marca.descripcion}
                            </p>
                          ) : null}

                          <p className="mt-2 text-xs text-slate-500">
                            Orden: {marca.orden ?? 0}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => comenzarEdicion(marca)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Editar
                          </button>

                          {!isMarcaPrincipal(marca) ? (
                            <button
                              onClick={() => {
                                void alternarActiva(marca);
                              }}
                              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                            >
                              Desactivar
                            </button>
                          ) : null}

                          {!isMarcaPrincipal(marca) ? (
                            <button
                              onClick={() => {
                                void eliminarMarca(marca);
                              }}
                              disabled={eliminandoId === marca.id}
                              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                            >
                              {eliminandoId === marca.id ? 'Eliminando...' : 'Eliminar'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                Marcas inactivas
              </h2>

              {marcasInactivas.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">
                  No hay marcas inactivas.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {marcasInactivas.map((marca) => (
                    <article
                      key={marca.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4 opacity-80"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-slate-900">
                              {marca.nombre}
                            </h3>

                            <span className="rounded-full bg-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700">
                              Inactiva
                            </span>
                          </div>

                          {marca.descripcion ? (
                            <p className="mt-1 text-sm text-slate-600">
                              {marca.descripcion}
                            </p>
                          ) : null}

                          <p className="mt-2 text-xs text-slate-500">
                            Orden: {marca.orden ?? 0}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => comenzarEdicion(marca)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Editar
                          </button>

                          <button
                            onClick={() => {
                              void alternarActiva(marca);
                            }}
                            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                          >
                            Activar
                          </button>

                          <button
                            onClick={() => {
                              void eliminarMarca(marca);
                            }}
                            disabled={eliminandoId === marca.id}
                            className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                          >
                            {eliminandoId === marca.id ? 'Eliminando...' : 'Eliminar'}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}