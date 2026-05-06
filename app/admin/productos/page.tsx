'use client';

import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from 'react';
import { supabase } from '@/lib/supabaseClient';
import { formatPlanLabel, type PlanCode } from '@/lib/plans';

type Categoria = {
  id: number;
  nombre: string;
  orden: number | null;
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

type Producto = {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  categoria: string | null;
  disponible: boolean | null;
  imagen_url?: string | null;
  control_stock?: boolean | null;
  stock_actual?: number | null;
  permitir_sin_stock?: boolean | null;
  marca_id?: string | null;
};

type ProductoImagen = {
  id: number;
  producto_id: number;
  image_url: string;
  storage_path: string;
  es_portada: boolean;
  orden: number | null;
};

type PendingImage = {
  key: string;
  file: File;
  preview: string;
  isCover: boolean;
};

type FormProducto = {
  id?: number | null;
  nombre: string;
  descripcion: string;
  precio: string;
  categoria: string;
  marca_id: string;
  disponible: boolean;
  control_stock: boolean;
  stock_actual: string;
  permitir_sin_stock: boolean;
};

type AdminSessionPayload = {
  plan?: PlanCode;
  addons?: {
    multi_brand?: boolean;
  };
  capabilities?: {
    stock_control?: boolean;
    multi_brand?: boolean;
  };
};

function sanitizeFileName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

function ensureOneCover(
  existing: ProductoImagen[],
  pending: PendingImage[]
): { existing: ProductoImagen[]; pending: PendingImage[] } {
  const hasExistingCover = existing.some((img) => img.es_portada);
  const hasPendingCover = pending.some((img) => img.isCover);

  if (hasExistingCover || hasPendingCover) {
    return { existing, pending };
  }

  if (existing.length > 0) {
    return {
      existing: existing.map((img, idx) => ({ ...img, es_portada: idx === 0 })),
      pending,
    };
  }

  if (pending.length > 0) {
    return {
      existing,
      pending: pending.map((img, idx) => ({ ...img, isCover: idx === 0 })),
    };
  }

  return { existing, pending };
}

function normalizeStockInput(value: string) {
  const cleaned = value.replace(/[^\d]/g, '');
  return cleaned;
}

function getStockLabel(producto: Producto) {
  if (!producto.control_stock) {
    return {
      text: 'Sin control de stock',
      className: 'bg-slate-100 text-slate-700',
    };
  }

  const stock = Number(producto.stock_actual ?? 0);

  if (stock <= 0) {
    return producto.permitir_sin_stock
      ? {
          text: 'Stock 0 · vende igual',
          className: 'bg-amber-100 text-amber-800',
        }
      : {
          text: 'Sin stock',
          className: 'bg-rose-100 text-rose-700',
        };
  }

  return {
    text: `Stock: ${stock}`,
    className: 'bg-sky-100 text-sky-800',
  };
}

const FALLBACK_CATEGORY_NAME = 'Otros';

function normalizeNonEmptyText(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function getInitialRequestedTenant() {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);

  return normalizeNonEmptyText(
    params.get('tenant') ??
      params.get('tenantSlug') ??
      params.get('slug') ??
      params.get('restaurant') ??
      params.get('restaurantSlug')
  );
}

export default function AdminProductosPage() {
  const [requestedTenant] = useState<string | null>(() =>
    getInitialRequestedTenant()
  );

  function buildTenantApiUrl(path: string) {
    if (!requestedTenant) return path;

    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}tenant=${encodeURIComponent(requestedTenant)}`;
  }

  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [currentPlan, setCurrentPlan] = useState<PlanCode>('esencial');
  const [stockControlEnabled, setStockControlEnabled] = useState(false);
  const [multiBrandEnabled, setMultiBrandEnabled] = useState(false);

  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas');
  const [busqueda, setBusqueda] = useState('');
  const [filtroMarca, setFiltroMarca] = useState<string>('todas');

  const [form, setForm] = useState<FormProducto>({
  id: null,
  nombre: '',
  descripcion: '',
  precio: '',
  categoria: '',
  marca_id: '',
  disponible: true,
  control_stock: false,
  stock_actual: '',
  permitir_sin_stock: false,
});

  const [modoEdicion, setModoEdicion] = useState(false);
  const [productoEditando, setProductoEditando] = useState<Producto | null>(null);

  const [imagenesExistentes, setImagenesExistentes] = useState<ProductoImagen[]>([]);
  const [imagenesPendientes, setImagenesPendientes] = useState<PendingImage[]>([]);
  const [cargandoImagenes, setCargandoImagenes] = useState(false);

  const [nuevaCategoria, setNuevaCategoria] = useState('');
  const [creandoCategoria, setCreandoCategoria] = useState(false);
  const [editandoCategoriaId, setEditandoCategoriaId] = useState<number | null>(null);
  const [nombreCategoriaEditando, setNombreCategoriaEditando] = useState('');
  const [guardandoCategoriaId, setGuardandoCategoriaId] = useState<number | null>(null);
  const [eliminandoCategoriaId, setEliminandoCategoriaId] = useState<number | null>(null);

  const cargarSession = async () => {
  try {
    const res = await fetch(buildTenantApiUrl('/api/admin/session'), {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
    });

    const raw = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(raw?.error || 'No se pudo cargar la sesión del admin.');
    }

    const session = (raw?.session as AdminSessionPayload | null) ?? null;
    const resolvedPlan = session?.plan ?? 'esencial';

    const stockEnabled =
      !!session?.capabilities?.stock_control ||
      resolvedPlan === 'pro' ||
      resolvedPlan === 'intelligence';

    const multiBrand =
      !!session?.capabilities?.multi_brand || !!session?.addons?.multi_brand;

    setCurrentPlan(resolvedPlan);
    setStockControlEnabled(stockEnabled);
    setMultiBrandEnabled(multiBrand);

    return {
      stockControlEnabled: stockEnabled,
      multiBrandEnabled: multiBrand,
    };
  } catch (error) {
    console.error('Error cargando sesión admin:', error);
    setCurrentPlan('esencial');
    setStockControlEnabled(false);
    setMultiBrandEnabled(false);

    return {
      stockControlEnabled: false,
      multiBrandEnabled: false,
    };
  }
};

  const cargarProductos = async () => {
  try {
    const res = await fetch(buildTenantApiUrl('/api/productos'), {
  cache: 'no-store',
});
    const raw = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(raw?.error || 'No se pudieron cargar los productos.');
    }

    if (!Array.isArray(raw)) {
      throw new Error('La respuesta de /api/productos no es válida.');
    }

    setProductos(raw as Producto[]);
  } catch (error: any) {
    console.error('Error cargando productos:', error);
    setMensaje(error?.message || 'No se pudieron cargar los productos.');
    setProductos([]);
  }
};

const cargarCategorias = async () => {
  try {
    const res = await fetch(buildTenantApiUrl('/api/categorias'), {
  cache: 'no-store',
});

    if (!res.ok) {
      throw new Error('No se pudieron cargar las categorías.');
    }

    const data = (await res.json()) as Categoria[];
    setCategorias(data ?? []);

    setForm((prev) => {
      if (prev.categoria) return prev;

      return {
        ...prev,
        categoria: data?.[0]?.nombre ?? '',
      };
    });
  } catch (error) {
    console.error('Error cargando categorías:', error);
    setMensaje('No se pudieron cargar las categorías.');
    setCategorias([]);
  }
};

const cargarMarcas = async () => {
  try {
    const res = await fetch(buildTenantApiUrl('/api/admin/marcas'), {
      method: 'GET',
      cache: 'no-store',
    });

    const raw = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(raw?.error || 'No se pudieron cargar las marcas.');
    }

    const marcasData = ((raw?.marcas ?? []) as Marca[]).filter(
      (marca) => marca.activa !== false
    );

    setMarcas(marcasData);

    setForm((prev) => {
      if (prev.marca_id) return prev;

      return {
        ...prev,
        marca_id: marcasData[0]?.id ?? '',
      };
    });
  } catch (error: any) {
    console.error('Error cargando marcas:', error);
    setMarcas([]);
    setMensaje(error?.message || 'No se pudieron cargar las marcas.');
  }
};

useEffect(() => {
  const cargarTodo = async () => {
    setCargando(true);
    setMensaje(null);

    const sessionFlags = await cargarSession();

    await Promise.all([
      cargarProductos(),
      cargarCategorias(),
      sessionFlags.multiBrandEnabled ? cargarMarcas() : Promise.resolve(),
    ]);

    if (!sessionFlags.multiBrandEnabled) {
      setMarcas([]);
      setFiltroMarca('todas');
    }

    setCargando(false);
  };

  void cargarTodo();
}, []);

  const cargarImagenesProducto = async (productoId: number) => {
    setCargandoImagenes(true);

    const { data, error } = await supabase
      .from('producto_imagenes')
      .select('id, producto_id, image_url, storage_path, es_portada, orden')
      .eq('producto_id', productoId)
      .order('orden', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      console.error('Error cargando imágenes del producto:', error);
      setImagenesExistentes([]);
      setCargandoImagenes(false);
      return;
    }

    const imgs = (data as ProductoImagen[]) ?? [];
    const normalized = ensureOneCover(imgs, []);
    setImagenesExistentes(normalized.existing);
    setCargandoImagenes(false);
  };

  const resetForm = () => {
  setForm({
  id: null,
  nombre: '',
  descripcion: '',
  precio: '',
  categoria: categorias[0]?.nombre ?? '',
  marca_id: marcas[0]?.id ?? '',
  disponible: true,
  control_stock: false,
  stock_actual: '',
  permitir_sin_stock: false,
});
  setModoEdicion(false);
  setProductoEditando(null);
  setImagenesExistentes([]);
  setImagenesPendientes([]);
  setCargandoImagenes(false);
};

  const onChangeForm = (
  field: keyof FormProducto,
  value: string | boolean
) => {
  setForm((prev) => {
    if (field === 'control_stock' && value === true && !stockControlEnabled) {
      return prev;
    }

    const next = {
      ...prev,
      [field]: value,
    };

      if (field === 'control_stock' && value === false) {
        next.stock_actual = '0';
        next.permitir_sin_stock = false;
      }

      if (field === 'stock_actual' && typeof value === 'string') {
        next.stock_actual = normalizeStockInput(value);
      }

      return next;
    });
  };

  const comenzarEdicion = async (p: Producto) => {
  setModoEdicion(true);
  setProductoEditando(p);
  setForm({
  id: p.id,
  nombre: p.nombre,
  descripcion: p.descripcion ?? '',
  precio: String(p.precio),
  categoria: p.categoria ?? categorias[0]?.nombre ?? '',
  marca_id: p.marca_id ?? marcas[0]?.id ?? '',
  disponible: !!p.disponible,
  control_stock: !!p.control_stock,
  stock_actual:
    p.stock_actual !== null && p.stock_actual !== undefined
      ? String(p.stock_actual)
      : '',
  permitir_sin_stock: !!p.permitir_sin_stock,
});
  setImagenesPendientes([]);
  await cargarImagenesProducto(p.id);
};

  const seleccionarPortadaExistente = (id: number) => {
    setImagenesExistentes((prev) =>
      prev.map((img) => ({ ...img, es_portada: img.id === id }))
    );
    setImagenesPendientes((prev) =>
      prev.map((img) => ({ ...img, isCover: false }))
    );
  };

  const seleccionarPortadaPendiente = (key: string) => {
    setImagenesPendientes((prev) =>
      prev.map((img) => ({ ...img, isCover: img.key === key }))
    );
    setImagenesExistentes((prev) =>
      prev.map((img) => ({ ...img, es_portada: false }))
    );
  };

  const quitarImagenPendiente = (key: string) => {
    setImagenesPendientes((prev) => {
      const next = prev.filter((img) => img.key !== key);
      const normalized = ensureOneCover(imagenesExistentes, next);
      return normalized.pending;
    });
  };

  const onSelectFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const nuevas: PendingImage[] = files.map((file, index) => ({
      key: `${Date.now()}-${index}-${file.name}`,
      file,
      preview: URL.createObjectURL(file),
      isCover: false,
    }));

    setImagenesPendientes((prev) => {
      const combinadas = [...prev, ...nuevas];
      const normalized = ensureOneCover(imagenesExistentes, combinadas);
      return normalized.pending;
    });

    e.target.value = '';
  };

  const crearCategoria = async () => {
    const nombre = nuevaCategoria.trim();
    if (!nombre) return;

    setCreandoCategoria(true);
    setMensaje(null);

    try {
      const res = await fetch(buildTenantApiUrl('/api/categorias'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre }),
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body?.error || 'No se pudo crear la categoría.');
      }

      const creada = body as Categoria;
      setCategorias((prev) =>
        [...prev, creada].sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999))
      );
      setNuevaCategoria('');
      setMensaje('Categoría creada correctamente.');

      if (!form.categoria) {
        setForm((prev) => ({ ...prev, categoria: creada.nombre }));
      }
    } catch (error: any) {
      console.error(error);
      setMensaje(error?.message ?? 'No se pudo crear la categoría.');
    } finally {
      setCreandoCategoria(false);
    }
  };

  const iniciarEdicionCategoria = (cat: Categoria) => {
    setEditandoCategoriaId(cat.id);
    setNombreCategoriaEditando(cat.nombre);
  };

  const guardarCategoriaEditada = async (id: number) => {
    const nombre = nombreCategoriaEditando.trim();
    if (!nombre) return;

    const anterior = categorias.find((c) => c.id === id);
    if (!anterior) return;

    setGuardandoCategoriaId(id);
    setMensaje(null);

    try {
      const res = await fetch(buildTenantApiUrl(`/api/categorias/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre }),
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body?.error || 'No se pudo actualizar la categoría.');
      }

      const actualizada = body as Categoria;

      setCategorias((prev) =>
        prev.map((c) => (c.id === id ? actualizada : c))
      );

      setProductos((prev) =>
        prev.map((p) =>
          p.categoria === anterior.nombre ? { ...p, categoria: actualizada.nombre } : p
        )
      );

      setForm((prev) =>
        prev.categoria === anterior.nombre ? { ...prev, categoria: actualizada.nombre } : prev
      );

      setEditandoCategoriaId(null);
      setNombreCategoriaEditando('');
      setMensaje('Categoría actualizada correctamente.');
    } catch (error: any) {
      console.error(error);
      setMensaje(error?.message ?? 'No se pudo actualizar la categoría.');
    } finally {
      setGuardandoCategoriaId(null);
    }
  };

  const eliminarCategoria = async (cat: Categoria) => {
    if (cat.nombre === FALLBACK_CATEGORY_NAME) {
      setMensaje(`La categoría "${FALLBACK_CATEGORY_NAME}" no se puede eliminar.`);
      return;
    }

    const confirmar = window.confirm(
      `¿Eliminar la categoría "${cat.nombre}"?\n\nLos productos que la usen pasarán a "${FALLBACK_CATEGORY_NAME}".`
    );

    if (!confirmar) return;

    setEliminandoCategoriaId(cat.id);
    setMensaje(null);

    try {
      const res = await fetch(buildTenantApiUrl(`/api/categorias/${cat.id}`), {
        method: 'DELETE',
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body?.error || 'No se pudo eliminar la categoría.');
      }

      setCategorias((prev) => prev.filter((c) => c.id !== cat.id));

      setProductos((prev) =>
        prev.map((p) =>
          p.categoria === cat.nombre
            ? { ...p, categoria: FALLBACK_CATEGORY_NAME }
            : p
        )
      );

      setForm((prev) =>
        prev.categoria === cat.nombre
          ? { ...prev, categoria: FALLBACK_CATEGORY_NAME }
          : prev
      );

      setMensaje(
        `Categoría eliminada. Los productos pasaron a "${FALLBACK_CATEGORY_NAME}".`
      );
    } catch (error: any) {
      console.error(error);
      setMensaje(error?.message ?? 'No se pudo eliminar la categoría.');
    } finally {
      setEliminandoCategoriaId(null);
    }
  };

  const subirImagenes = async (productoId: number) => {
    if (imagenesPendientes.length === 0) {
      return [] as ProductoImagen[];
    }

    const maxOrdenExistente =
      imagenesExistentes.reduce((acc, img) => Math.max(acc, img.orden ?? 0), 0) || 0;

    const inserts: Omit<ProductoImagen, 'id'>[] = [];

    for (let index = 0; index < imagenesPendientes.length; index += 1) {
      const img = imagenesPendientes[index];
      const ext = img.file.name.split('.').pop() || 'jpg';
      const safeName = sanitizeFileName(img.file.name.replace(/\.[^.]+$/, ''));
      const path = `${productoId}/${Date.now()}-${index}-${safeName}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('productos')
        .upload(path, img.file, {
          upsert: false,
          cacheControl: '3600',
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from('productos')
        .getPublicUrl(path);

      inserts.push({
        producto_id: productoId,
        image_url: publicData.publicUrl,
        storage_path: path,
        es_portada: img.isCover,
        orden: maxOrdenExistente + index + 1,
      });
    }

    const { data, error } = await supabase
      .from('producto_imagenes')
      .insert(inserts)
      .select('id, producto_id, image_url, storage_path, es_portada, orden');

    if (error) throw error;

    return (data as ProductoImagen[]) ?? [];
  };

  const sincronizarPortada = async (
    productoId: number,
    existing: ProductoImagen[],
    uploaded: ProductoImagen[]
  ) => {
    const all = [...existing, ...uploaded];

    let portada = all.find((img) => img.es_portada) ?? null;
    if (!portada && all.length > 0) {
      portada = all[0];
    }

    if (all.length > 0 && portada) {
      for (const img of all) {
        const { error } = await supabase
          .from('producto_imagenes')
          .update({ es_portada: img.id === portada.id })
          .eq('id', img.id);

        if (error) throw error;
      }
    }

    const portadaUrl = portada?.image_url ?? productoEditando?.imagen_url ?? null;

    const { error: errorProducto } = await supabase
      .from('productos')
      .update({ imagen_url: portadaUrl })
      .eq('id', productoId);

    if (errorProducto) throw errorProducto;
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

    const controlStock = !!form.control_stock;
    const stockActualRaw = form.stock_actual.trim() === '' ? '0' : form.stock_actual.trim();
    const stockActual = Number(stockActualRaw);

    if (controlStock && (!Number.isInteger(stockActual) || stockActual < 0)) {
      setMensaje('El stock actual debe ser un número entero mayor o igual a 0.');
      setGuardando(false);
      return;
    }

    const stockActualNumber =
  form.stock_actual.trim() === '' ? 0 : Number(form.stock_actual);

if (!Number.isFinite(stockActualNumber) || stockActualNumber < 0) {
  setMensaje('El stock actual debe ser un número válido mayor o igual a 0.');
  setGuardando(false);
  return;
}

const controlStockFinal = stockControlEnabled && form.control_stock;

const payload = {
  nombre: form.nombre.trim(),
  descripcion: form.descripcion.trim() || null,
  precio: precioNumber,
  categoria: form.categoria || null,
  marca_id: multiBrandEnabled ? form.marca_id || marcas[0]?.id || null : null,
  disponible: form.disponible,
  imagen_url: productoEditando?.imagen_url ?? null,
  control_stock: controlStockFinal,
  stock_actual: controlStockFinal ? stockActualNumber : 0,
  permitir_sin_stock: controlStockFinal ? form.permitir_sin_stock : true,
};

    if (!payload.nombre) {
      setMensaje('El nombre es obligatorio.');
      setGuardando(false);
      return;
    }

    if (!payload.categoria) {
      setMensaje('La categoría es obligatoria.');
      setGuardando(false);
      return;
    }

    try {
      let productoId: number;

      if (modoEdicion && form.id) {
        const res = await fetch(buildTenantApiUrl(`/api/productos/${form.id}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const body = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(body?.error || 'No se pudo actualizar el producto.');
        }

        productoId = form.id;
      } else {
        const res = await fetch(buildTenantApiUrl('/api/productos'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            imagen_url: null,
          }),
        });

        const body = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(body?.error || 'No se pudo crear el producto.');
        }

        const data = body as Producto;
        productoId = data.id;
      }

      const normalized = ensureOneCover(imagenesExistentes, imagenesPendientes);
      const existingNormalized = normalized.existing;
      const pendingNormalized = normalized.pending;

      setImagenesExistentes(existingNormalized);
      setImagenesPendientes(pendingNormalized);

      const uploaded = await subirImagenes(productoId);
      await sincronizarPortada(productoId, existingNormalized, uploaded);

      await Promise.all([
  cargarProductos(),
  cargarCategorias(),
  multiBrandEnabled ? cargarMarcas() : Promise.resolve(),
]);

      setMensaje(
        modoEdicion
          ? 'Producto actualizado correctamente.'
          : 'Producto creado correctamente.'
      );

      resetForm();
    } catch (error: any) {
      console.error('Error guardando producto:', error);
      setMensaje(
        error?.message ||
          (modoEdicion
            ? 'No se pudo actualizar el producto.'
            : 'No se pudo crear el producto.')
      );
    } finally {
      setGuardando(false);
    }
  };

  const eliminarProducto = async (id: number) => {
    const prod = productos.find((p) => p.id === id);
    if (!prod) return;

    if (!window.confirm(`¿Eliminar "${prod.nombre}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    setEliminandoId(id);
    setMensaje(null);

    try {
      const { data: imagenes } = await supabase
        .from('producto_imagenes')
        .select('id, storage_path')
        .eq('producto_id', id);

      const paths = (imagenes ?? [])
        .map((img: any) => img.storage_path)
        .filter(Boolean);

      if (paths.length > 0) {
        await supabase.storage.from('productos').remove(paths);
      }

      await supabase.from('producto_imagenes').delete().eq('producto_id', id);

      const res = await fetch(buildTenantApiUrl(`/api/productos/${id}`), {
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
    const res = await fetch(buildTenantApiUrl(`/api/productos/${p.id}/disponible`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disponible: nuevoEstado }),
    });

    const raw = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(raw?.error || 'No se pudo cambiar la disponibilidad.');
    }

    if (!raw || typeof raw !== 'object' || !('id' in raw)) {
      throw new Error('La respuesta del servidor no tiene un producto válido.');
    }

    const data = raw as Producto;

    setProductos((prev) => {
      return prev.map((prod) => (prod.id === p.id ? data : prod));
    });
  } catch (error: any) {
    console.error('Error cambiando disponibilidad:', error);
    setMensaje(error?.message || 'No se pudo cambiar la disponibilidad.');
  }
};

const marcasPorId = useMemo(() => {
  return new Map(marcas.map((marca) => [marca.id, marca]));
}, [marcas]);

const getMarcaNombre = (producto: Producto) => {
  if (!producto.marca_id) return null;
  return marcasPorId.get(producto.marca_id)?.nombre ?? null;
};

  const productosFiltrados = useMemo(() => {
  return productos.filter((p) => {
    const coincideCategoria =
      filtroCategoria === 'todas' || (p.categoria ?? '') === filtroCategoria;

    const coincideMarca =
      !multiBrandEnabled ||
      filtroMarca === 'todas' ||
      (p.marca_id ?? '') === filtroMarca;

    const coincideBusqueda =
      !busqueda.trim() ||
      p.nombre.toLowerCase().includes(busqueda.toLowerCase());

    return coincideCategoria && coincideMarca && coincideBusqueda;
  });
}, [productos, filtroCategoria, filtroMarca, busqueda, multiBrandEnabled]);

  return (
  <div className="space-y-6">
    {requestedTenant ? (
      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Estás administrando productos para la sucursal{' '}
        <strong>{requestedTenant}</strong>.
      </div>
    ) : (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        Estás administrando productos del local actual. Para cargar productos de
        una sucursal específica, entrá desde Restaurantes / sucursales.
      </div>
    )}
      <section className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Menú / Productos</h1>
          <p className="mt-1 text-sm text-slate-600">
            Plan actual: <strong>{formatPlanLabel(currentPlan)}</strong>
          </p>
        </div>

        <button
  onClick={async () => {
    setCargando(true);

    const sessionFlags = await cargarSession();

    await Promise.all([
      cargarProductos(),
      cargarCategorias(),
      sessionFlags.multiBrandEnabled ? cargarMarcas() : Promise.resolve(),
    ]);

    if (!sessionFlags.multiBrandEnabled) {
      setMarcas([]);
      setFiltroMarca('todas');
    }

    setCargando(false);
  }}
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

      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Categorías</h2>
        </div>

        <div className="flex flex-col md:flex-row gap-2">
          <input
            type="text"
            value={nuevaCategoria}
            onChange={(e) => setNuevaCategoria(e.target.value)}
            placeholder="Nueva categoría"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={crearCategoria}
            disabled={creandoCategoria}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
          >
            {creandoCategoria ? 'Creando...' : 'Crear categoría'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {categorias.length === 0 && (
            <p className="text-sm text-slate-500">Todavía no hay categorías.</p>
          )}

          {categorias.map((cat) => {
            const esFallback = cat.nombre === FALLBACK_CATEGORY_NAME;

            return (
              <div
                key={cat.id}
                className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 flex items-center gap-2 flex-wrap"
              >
                {editandoCategoriaId === cat.id ? (
                  <>
                    <input
                      type="text"
                      value={nombreCategoriaEditando}
                      onChange={(e) => setNombreCategoriaEditando(e.target.value)}
                      className="border border-slate-300 rounded px-2 py-1 text-sm"
                    />
                    <button
                      onClick={() => guardarCategoriaEditada(cat.id)}
                      disabled={guardandoCategoriaId === cat.id}
                      className="text-xs px-2 py-1 rounded bg-slate-900 text-white"
                    >
                      {guardandoCategoriaId === cat.id ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button
                      onClick={() => {
                        setEditandoCategoriaId(null);
                        setNombreCategoriaEditando('');
                      }}
                      className="text-xs px-2 py-1 rounded border border-slate-300"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium">{cat.nombre}</span>

                    {esFallback && (
                      <span className="text-[11px] px-2 py-1 rounded-full bg-slate-200 text-slate-700">
                        Categoría protegida
                      </span>
                    )}

                    {!esFallback && (
                      <button
                        onClick={() => iniciarEdicionCategoria(cat)}
                        className="text-xs px-2 py-1 rounded border border-slate-300 bg-white"
                      >
                        Editar
                      </button>
                    )}

                    {!esFallback && (
                      <button
                        onClick={() => eliminarCategoria(cat)}
                        disabled={eliminandoCategoriaId === cat.id}
                        className="text-xs px-2 py-1 rounded border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                      >
                        {eliminandoCategoriaId === cat.id ? 'Eliminando...' : 'Eliminar'}
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

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

        {!stockControlEnabled ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            El <strong>control real de stock</strong> está disponible desde{' '}
            <strong>Pro</strong>. En tu plan actual podés seguir cargando productos y
            disponibilidad manual.
          </div>
        ) : null}

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
              <option value="">Seleccionar...</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.nombre}>
                  {c.nombre}
                </option>
              ))}
            </select>

            {multiBrandEnabled ? (
  <div className="mt-2 space-y-2">
    <label className="block text-xs font-medium text-slate-700">
      Marca
    </label>

    {marcas.length > 0 ? (
      <select
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        value={form.marca_id}
        onChange={(e) => onChangeForm('marca_id', e.target.value)}
      >
        <option value="">Seleccionar marca...</option>
        {marcas.map((marca) => (
          <option key={marca.id} value={marca.id}>
            {marca.nombre}
          </option>
        ))}
      </select>
    ) : (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        No hay marcas activas cargadas. Andá a <strong>Admin &gt; Marcas</strong>{' '}
        y creá o activá una marca.
      </div>
    )}
  </div>
) : null}

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

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Control de stock
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Cuando está activo, el sistema puede validar stock real al vender.
            </p>
          </div>

          <div className="mt-3 flex items-center gap-2">
  <input
  id="control_stock"
  type="checkbox"
  checked={form.control_stock}
  disabled={!stockControlEnabled}
  onChange={(e) => onChangeForm('control_stock', e.target.checked)}
/>
  <label
  htmlFor="control_stock"
  className={`text-xs ${
    stockControlEnabled ? 'text-slate-700' : 'text-slate-400'
  }`}
>
  Controlar stock real
</label>
</div>

{form.control_stock ? (
  <div className="mt-3 space-y-2">
    <label className="block text-xs font-medium text-slate-700">
      Stock actual
    </label>
    <input
      type="number"
      min={0}
      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
      value={form.stock_actual}
      onChange={(e) => onChangeForm('stock_actual', e.target.value)}
      placeholder="Ej: 15"
    />

    <div className="flex items-center gap-2">
      <input
        id="permitir_sin_stock"
        type="checkbox"
        checked={form.permitir_sin_stock}
        onChange={(e) =>
          onChangeForm('permitir_sin_stock', e.target.checked)
        }
      />
      <label htmlFor="permitir_sin_stock" className="text-xs text-slate-700">
        Permitir vender aunque se quede sin stock
      </label>
    </div>
  </div>
) : null}

          {stockControlEnabled && form.control_stock ? (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              Con esta opción activa, el producto puede quedar automáticamente sin
              stock al venderse si no permitís ventas con stock 0.
            </div>
          ) : null}
        </div>

        <div className="space-y-2 pt-2">
          <label className="block text-xs font-medium text-slate-700">
            Fotos del producto
          </label>

          <input
            type="file"
            accept="image/*"
            multiple
            onChange={onSelectFiles}
            className="block w-full text-sm"
          />

          <p className="text-xs text-slate-500">
            Podés subir fotos desde el celular o la compu. Tocá o hacé clic sobre una miniatura para elegir la portada.
          </p>

          {cargandoImagenes && (
            <p className="text-sm text-slate-500">Cargando imágenes guardadas...</p>
          )}

          {!cargandoImagenes &&
            imagenesExistentes.length === 0 &&
            imagenesPendientes.length === 0 &&
            productoEditando?.imagen_url && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
                Este producto tiene una imagen vieja cargada por URL. Si subís fotos nuevas, la portada se reemplazará por la que elijas.
              </p>
            )}

          {(imagenesExistentes.length > 0 || imagenesPendientes.length > 0) && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {imagenesExistentes.map((img) => (
                <button
                  key={`exist-${img.id}`}
                  type="button"
                  onClick={() => seleccionarPortadaExistente(img.id)}
                  className={`relative rounded-xl overflow-hidden border-2 ${
                    img.es_portada ? 'border-emerald-500' : 'border-slate-200'
                  }`}
                  title="Elegir como portada"
                >
                  <img
                    src={img.image_url}
                    alt="Producto"
                    className="w-full h-24 object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-[11px] py-1">
                    {img.es_portada ? 'Portada' : 'Tocar para portada'}
                  </div>
                </button>
              ))}

              {imagenesPendientes.map((img) => (
                <div key={`new-${img.key}`} className="relative">
                  <button
                    type="button"
                    onClick={() => seleccionarPortadaPendiente(img.key)}
                    className={`relative w-full rounded-xl overflow-hidden border-2 ${
                      img.isCover ? 'border-emerald-500' : 'border-slate-200'
                    }`}
                    title="Elegir como portada"
                  >
                    <img
                      src={img.preview}
                      alt="Nueva imagen"
                      className="w-full h-24 object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-[11px] py-1">
                      {img.isCover ? 'Portada nueva' : 'Tocar para portada'}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => quitarImagenPendiente(img.key)}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-rose-600 text-white text-xs shadow"
                    title="Quitar"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
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

      {categorias.map((c) => (
        <button
          key={c.id}
          onClick={() => setFiltroCategoria(c.nombre)}
          className={`px-3 py-1 rounded-full border ${
            filtroCategoria === c.nombre
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-300'
          }`}
        >
          {c.nombre}
        </button>
      ))}
    </div>

    {multiBrandEnabled && marcas.length > 0 ? (
      <div className="flex flex-wrap gap-2 text-xs">
        <button
          onClick={() => setFiltroMarca('todas')}
          className={`px-3 py-1 rounded-full border ${
            filtroMarca === 'todas'
              ? 'bg-emerald-700 text-white border-emerald-700'
              : 'bg-white text-slate-700 border-slate-300'
          }`}
        >
          Todas las marcas
        </button>

        {marcas.map((marca) => (
          <button
            key={marca.id}
            onClick={() => setFiltroMarca(marca.id)}
            className={`px-3 py-1 rounded-full border ${
              filtroMarca === marca.id
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-white text-slate-700 border-slate-300'
            }`}
          >
            {marca.nombre}
          </button>
        ))}
      </div>
    ) : null}

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
  const stockBadge = getStockLabel(p);
  const marcaNombre = getMarcaNombre(p);

  return (
              <article
                key={p.id}
                className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col gap-2"
              >
                <div className="flex items-start gap-3">
                  {p.imagen_url ? (
                    <img
                      src={p.imagen_url}
                      alt={p.nombre}
                      className="w-16 h-16 rounded-lg object-cover border border-slate-200"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center text-[11px] text-slate-400 text-center px-1">
                      Sin foto
                    </div>
                  )}

                  <div className="flex-1">
                    <div className="flex justify-between gap-2">
                      <h3 className="font-semibold text-slate-900">{p.nombre}</h3>
                      <span className="text-sm font-bold">${p.precio}</span>
                    </div>

                    <p className="text-xs text-slate-500">
                      {p.categoria ?? FALLBACK_CATEGORY_NAME}
                    </p>

                    {multiBrandEnabled && marcaNombre ? (
  <p className="mt-1 text-[11px] font-medium text-emerald-700">
    Marca: {marcaNombre}
  </p>
) : null}

                    {p.descripcion && (
                      <p className="mt-1 text-sm text-slate-700 line-clamp-2">
                        {p.descripcion}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap gap-2">
                      <span
                        className={`px-2 py-1 rounded-full text-[11px] font-medium ${stockBadge.className}`}
                      >
                        {stockBadge.text}
                      </span>

                      {p.control_stock && p.permitir_sin_stock ? (
                        <span className="px-2 py-1 rounded-full text-[11px] font-medium bg-violet-100 text-violet-800">
                          Backorder
                        </span>
                      ) : null}
                    </div>
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