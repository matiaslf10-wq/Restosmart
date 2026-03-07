'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Categoria = {
  id: number;
  nombre: string;
  orden: number | null;
};

type MenuItem = {
  id: number;
  categoria_id: number | null;
  nombre: string;
  descripcion: string | null;
  precio: number;
  disponible: boolean;
  imagen_url: string | null;
  categoria?: Categoria;
};

const emptyItem: Omit<MenuItem, 'id'> = {
  categoria_id: null,
  nombre: '',
  descripcion: '',
  precio: 0,
  disponible: true,
  imagen_url: null,
};

type FiltroCategoria = number | 'todas';

export default function AdminMenuPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [formData, setFormData] = useState<Omit<MenuItem, 'id'>>(emptyItem);
  const [filterCategoria, setFilterCategoria] = useState<FiltroCategoria>('todas');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cargar categorías e items
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setErrorMsg(null);

      // Categorías
      const { data: catData, error: catError } = await supabase
        .from('categorias')
        .select('*')
        .order('orden', { ascending: true });

      if (catError) {
        console.error(catError);
        setErrorMsg('Error cargando categorías');
        setLoading(false);
        return;
      }

      // Items del menú con join a categorías
      const { data: itemData, error: itemError } = await supabase
        .from('menu_items')
        .select(
          `
            id,
            categoria_id,
            nombre,
            descripcion,
            precio,
            disponible,
            imagen_url,
            categorias (
              id,
              nombre,
              orden
            )
          `
        )
        .order('nombre', { ascending: true });

      if (itemError) {
        console.error(itemError);
        setErrorMsg('Error cargando menú');
        setLoading(false);
        return;
      }

      const itemsMapeados: MenuItem[] =
        itemData?.map((row: any) => ({
          id: row.id,
          categoria_id: row.categoria_id,
          nombre: row.nombre,
          descripcion: row.descripcion,
          precio: row.precio,
          disponible: row.disponible,
          imagen_url: row.imagen_url,
          categoria: row.categorias
            ? {
                id: row.categorias.id,
                nombre: row.categorias.nombre,
                orden: row.categorias.orden,
              }
            : undefined,
        })) ?? [];

      setCategorias(catData ?? []);
      setItems(itemsMapeados);
      setLoading(false);
    };

    fetchData();
  }, []);

  const resetForm = () => {
    setEditingItem(null);
    setFormData(emptyItem);
  };

  const handleEdit = (item: MenuItem) => {
    setEditingItem(item);
    setFormData({
      categoria_id: item.categoria_id,
      nombre: item.nombre,
      descripcion: item.descripcion,
      precio: item.precio,
      disponible: item.disponible,
      imagen_url: item.imagen_url,
    });
  };

  const handleDelete = async (item: MenuItem) => {
    if (!confirm(`¿Eliminar "${item.nombre}" del menú?`)) return;

    const { error } = await supabase.from('menu_items').delete().eq('id', item.id);

    if (error) {
      console.error(error);
      alert('Error al eliminar el ítem');
      return;
    }

    setItems(prev => prev.filter(i => i.id !== item.id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);

    try {
      if (!formData.nombre.trim()) {
        throw new Error('El nombre es obligatorio');
      }
      if (!formData.categoria_id) {
        throw new Error('La categoría es obligatoria');
      }

      if (editingItem) {
        // UPDATE
        const { data, error } = await supabase
          .from('menu_items')
          .update({
            categoria_id: formData.categoria_id,
            nombre: formData.nombre,
            descripcion: formData.descripcion,
            precio: formData.precio,
            disponible: formData.disponible,
            imagen_url: formData.imagen_url,
          })
          .eq('id', editingItem.id)
          .select(
            `
              id,
              categoria_id,
              nombre,
              descripcion,
              precio,
              disponible,
              imagen_url,
              categorias (
                id,
                nombre,
                orden
              )
            `
          )
          .single();

        if (error) throw error;

        const itemActualizado: MenuItem = {
          id: data.id,
          categoria_id: data.categoria_id,
          nombre: data.nombre,
          descripcion: data.descripcion,
          precio: data.precio,
          disponible: data.disponible,
          imagen_url: data.imagen_url,
          categoria: data.categorias
            ? {
                id: data.categorias.id,
                nombre: data.categorias.nombre,
                orden: data.categorias.orden,
              }
            : undefined,
        };

        setItems(prev => prev.map(i => (i.id === editingItem.id ? itemActualizado : i)));
      } else {
        // INSERT
        const { data, error } = await supabase
          .from('menu_items')
          .insert({
            categoria_id: formData.categoria_id,
            nombre: formData.nombre,
            descripcion: formData.descripcion,
            precio: formData.precio,
            disponible: formData.disponible,
            imagen_url: formData.imagen_url,
          })
          .select(
            `
              id,
              categoria_id,
              nombre,
              descripcion,
              precio,
              disponible,
              imagen_url,
              categorias (
                id,
                nombre,
                orden
              )
            `
          )
          .single();

        if (error) throw error;

        const nuevoItem: MenuItem = {
          id: data.id,
          categoria_id: data.categoria_id,
          nombre: data.nombre,
          descripcion: data.descripcion,
          precio: data.precio,
          disponible: data.disponible,
          imagen_url: data.imagen_url,
          categoria: data.categorias
            ? {
                id: data.categorias.id,
                nombre: data.categorias.nombre,
                orden: data.categorias.orden,
              }
            : undefined,
        };

        setItems(prev => [...prev, nuevoItem]);
      }

      resetForm();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error guardando el ítem, revisá los datos.');
    } finally {
      setSaving(false);
    }
  };

  const itemsFiltrados: MenuItem[] =
    filterCategoria === 'todas'
      ? items
      : items.filter(i => i.categoria_id === filterCategoria);

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '2rem',
        maxWidth: 1100,
        margin: '0 auto',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '1rem' }}>
        Admin – Menú del restaurante
      </h1>

      {loading && <p>Cargando datos...</p>}
      {errorMsg && (
        <p style={{ color: 'red', marginBottom: '1rem' }}>
          {errorMsg}
        </p>
      )}

      {/* FORMULARIO */}
      <section
        style={{
          border: '1px solid #ddd',
          borderRadius: 12,
          padding: '1.5rem',
          marginBottom: '2rem',
          boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
        }}
      >
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>
          {editingItem ? 'Editar ítem del menú' : 'Agregar ítem al menú'}
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: 14, marginBottom: 4 }}>
              Categoría
            </label>
            <select
              value={formData.categoria_id ?? ''}
              onChange={e =>
                setFormData(prev => ({
                  ...prev,
                  categoria_id: e.target.value ? Number(e.target.value) : null,
                }))
              }
              style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #ccc' }}
              required
            >
              <option value="">Seleccionar...</option>
              {categorias.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 14, marginBottom: 4 }}>
              Nombre
            </label>
            <input
              type="text"
              value={formData.nombre}
              onChange={e => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
              style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #ccc' }}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 14, marginBottom: 4 }}>
              Descripción (opcional)
            </label>
            <textarea
              value={formData.descripcion ?? ''}
              onChange={e => setFormData(prev => ({ ...prev, descripcion: e.target.value }))}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: 6,
                border: '1px solid #ccc',
                minHeight: 60,
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 14, marginBottom: 4 }}>
              URL de la imagen (opcional)
            </label>
            <input
              type="text"
              placeholder="https://..."
              value={formData.imagen_url ?? ''}
              onChange={e =>
                setFormData(prev => ({
                  ...prev,
                  imagen_url: e.target.value.trim() === '' ? null : e.target.value,
                }))
              }
              style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #ccc' }}
            />
            {formData.imagen_url && (
              <div style={{ marginTop: 8 }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>Vista previa:</span>
                <div
                  style={{
                    marginTop: 4,
                    width: 120,
                    height: 80,
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: '1px solid #e5e7eb',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={formData.imagen_url}
                    alt={formData.nombre || 'Vista previa'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 14, marginBottom: 4 }}>
                Precio
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.precio}
                onChange={e =>
                  setFormData(prev => ({
                    ...prev,
                    precio: Number(e.target.value),
                  }))
                }
                style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #ccc' }}
                required
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="disponible"
                type="checkbox"
                checked={formData.disponible}
                onChange={e =>
                  setFormData(prev => ({ ...prev, disponible: e.target.checked }))
                }
              />
              <label htmlFor="disponible" style={{ fontSize: 14 }}>
                Disponible
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '0.6rem 1.2rem',
                borderRadius: 999,
                border: 'none',
                background: '#111827',
                color: '#fff',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {saving
                ? 'Guardando...'
                : editingItem
                ? 'Guardar cambios'
                : 'Agregar al menú'}
            </button>
            {editingItem && (
              <button
                type="button"
                onClick={resetForm}
                style={{
                  padding: '0.6rem 1.2rem',
                  borderRadius: 999,
                  border: '1px solid #ccc',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                Cancelar edición
              </button>
            )}
          </div>
        </form>
      </section>

      {/* LISTADO */}
      <section>
        {/* Filtro por categoría – primero se eligen las categorías */}
        <div style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Ítems del menú</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setFilterCategoria('todas')}
              style={{
                padding: '0.3rem 0.8rem',
                borderRadius: 999,
                border: '1px solid #d1d5db',
                background: filterCategoria === 'todas' ? '#111827' : '#fff',
                color: filterCategoria === 'todas' ? '#fff' : '#111827',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Todas
            </button>
            {categorias.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setFilterCategoria(cat.id)}
                style={{
                  padding: '0.3rem 0.8rem',
                  borderRadius: 999,
                  border: '1px solid #d1d5db',
                  background: filterCategoria === cat.id ? '#111827' : '#fff',
                  color: filterCategoria === cat.id ? '#fff' : '#111827',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                {cat.nombre}
              </button>
            ))}
          </div>
        </div>

        {itemsFiltrados.length === 0 ? (
          <p>No hay ítems cargados para este filtro.</p>
        ) : (
          <div
            style={{
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 14,
              }}
            >
              <thead style={{ background: '#f9fafb' }}>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Imagen</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Nombre</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Categoría</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Precio</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Estado</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {itemsFiltrados.map(item => (
                  <tr
                    key={item.id}
                    style={{
                      borderTop: '1px solid #e5e7eb',
                      background: item.disponible ? 'white' : '#f3f4f6',
                    }}
                  >
                    <td style={{ padding: '0.5rem' }}>
                      {item.imagen_url ? (
                        <div
                          style={{
                            width: 72,
                            height: 48,
                            borderRadius: 8,
                            overflow: 'hidden',
                            border: '1px solid #e5e7eb',
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.imagen_url}
                            alt={item.nombre}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: '#9ca3af' }}>Sin imagen</span>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <div style={{ fontWeight: 500 }}>{item.nombre}</div>
                      {item.descripcion && (
                        <div style={{ fontSize: 12, color: '#6b7280' }}>
                          {item.descripcion}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      {item.categoria?.nombre ?? 'Sin categoría'}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      ${item.precio.toFixed(2)}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      {item.disponible ? 'Disponible' : 'No disponible'}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <button
                        onClick={() => handleEdit(item)}
                        style={{
                          padding: '0.3rem 0.7rem',
                          borderRadius: 999,
                          border: '1px solid #d1d5db',
                          background: '#fff',
                          marginRight: 4,
                          cursor: 'pointer',
                        }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        style={{
                          padding: '0.3rem 0.7rem',
                          borderRadius: 999,
                          border: 'none',
                          background: '#b91c1c',
                          color: '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
