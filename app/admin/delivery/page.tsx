'use client';

import { useEffect, useState } from 'react';

type DeliveryConfig = {
  activo: boolean;
  whatsapp_numero: string;
  whatsapp_nombre_mostrado: string;
  acepta_efectivo: boolean;
  efectivo_requiere_aprobacion: boolean;
  acepta_mercadopago: boolean;
  mensaje_bienvenida: string;
  tiempo_estimado_min: number;
  costo_envio: number;
};

const DEFAULT_CONFIG: DeliveryConfig = {
  activo: false,
  whatsapp_numero: '',
  whatsapp_nombre_mostrado: '',
  acepta_efectivo: true,
  efectivo_requiere_aprobacion: true,
  acepta_mercadopago: false,
  mensaje_bienvenida:
    'Hola 👋 Gracias por comunicarte con nosotros. Decime qué querés pedir y te ayudamos con tu compra.',
  tiempo_estimado_min: 45,
  costo_envio: 0,
};

export default function AdminDeliveryPage() {
  const [form, setForm] = useState<DeliveryConfig>(DEFAULT_CONFIG);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;

    async function cargarConfiguracion() {
      try {
        setCargando(true);
        setError('');
        setMensaje('');

        const res = await fetch('/api/admin/delivery-config', {
          method: 'GET',
          cache: 'no-store',
        });

        if (!res.ok) {
          throw new Error('No se pudo cargar la configuración de delivery.');
        }

        const data = await res.json();

        if (!activo) return;

        setForm({
          activo: !!data.activo,
          whatsapp_numero: data.whatsapp_numero ?? '',
          whatsapp_nombre_mostrado: data.whatsapp_nombre_mostrado ?? '',
          acepta_efectivo:
            data.acepta_efectivo === undefined ? true : !!data.acepta_efectivo,
          efectivo_requiere_aprobacion:
            data.efectivo_requiere_aprobacion === undefined
              ? true
              : !!data.efectivo_requiere_aprobacion,
          acepta_mercadopago: !!data.acepta_mercadopago,
          mensaje_bienvenida:
            data.mensaje_bienvenida ?? DEFAULT_CONFIG.mensaje_bienvenida,
          tiempo_estimado_min: Number(
            data.tiempo_estimado_min ?? DEFAULT_CONFIG.tiempo_estimado_min
          ),
          costo_envio: Number(data.costo_envio ?? 0),
        });
      } catch (err) {
        console.error(err);
        if (!activo) return;
        setError(
          'No se pudo cargar la configuración. Verificá la API /api/admin/delivery-config.'
        );
      } finally {
        if (activo) {
          setCargando(false);
        }
      }
    }

    cargarConfiguracion();

    return () => {
      activo = false;
    };
  }, []);

  function updateField<K extends keyof DeliveryConfig>(
    key: K,
    value: DeliveryConfig[K]
  ) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    try {
      setGuardando(true);
      setMensaje('');
      setError('');

      const res = await fetch('/api/admin/delivery-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo guardar la configuración.');
      }

      setMensaje('Configuración de delivery guardada correctamente.');
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'Ocurrió un error al guardar la configuración.'
      );
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return (
      <main className="p-6">
        <h1 className="mb-4 text-2xl font-semibold">Delivery</h1>
        <p>Cargando configuración...</p>
      </main>
    );
  }

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Configuración de delivery</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Desde acá podés definir el número de WhatsApp, medios de pago y
          comportamiento inicial del canal de delivery.
        </p>
      </div>

      <form onSubmit={guardar} className="grid gap-6">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-medium">Estado general</h2>

          <label className="mb-4 flex items-center gap-3">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => updateField('activo', e.target.checked)}
            />
            <span>Activar canal de delivery</span>
          </label>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-medium">WhatsApp</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Número de WhatsApp</span>
              <input
                type="text"
                value={form.whatsapp_numero}
                onChange={(e) =>
                  updateField('whatsapp_numero', e.target.value)
                }
                placeholder="54911XXXXXXXX"
                className="rounded-xl border px-3 py-2"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Nombre visible</span>
              <input
                type="text"
                value={form.whatsapp_nombre_mostrado}
                onChange={(e) =>
                  updateField('whatsapp_nombre_mostrado', e.target.value)
                }
                placeholder="RestoSmart Delivery"
                className="rounded-xl border px-3 py-2"
              />
            </label>
          </div>

          <label className="mt-4 grid gap-2">
            <span className="text-sm font-medium">Mensaje de bienvenida</span>
            <textarea
              value={form.mensaje_bienvenida}
              onChange={(e) =>
                updateField('mensaje_bienvenida', e.target.value)
              }
              rows={4}
              className="rounded-xl border px-3 py-2"
            />
          </label>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-medium">Pago</h2>

          <div className="grid gap-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.acepta_efectivo}
                onChange={(e) =>
                  updateField('acepta_efectivo', e.target.checked)
                }
              />
              <span>Aceptar efectivo</span>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.efectivo_requiere_aprobacion}
                onChange={(e) =>
                  updateField(
                    'efectivo_requiere_aprobacion',
                    e.target.checked
                  )
                }
              />
              <span>El efectivo requiere aprobación manual de admin o mozo</span>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.acepta_mercadopago}
                onChange={(e) =>
                  updateField('acepta_mercadopago', e.target.checked)
                }
              />
              <span>Aceptar Mercado Pago</span>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-medium">Operación</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium">
                Tiempo estimado de entrega (min)
              </span>
              <input
                type="number"
                min={0}
                value={form.tiempo_estimado_min}
                onChange={(e) =>
                  updateField('tiempo_estimado_min', Number(e.target.value))
                }
                className="rounded-xl border px-3 py-2"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Costo de envío</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.costo_envio}
                onChange={(e) =>
                  updateField('costo_envio', Number(e.target.value))
                }
                className="rounded-xl border px-3 py-2"
              />
            </label>
          </div>
        </section>

        {mensaje ? (
          <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
            {mensaje}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={guardando}
            className="rounded-xl bg-black px-5 py-3 text-white disabled:opacity-60"
          >
            {guardando ? 'Guardando...' : 'Guardar configuración'}
          </button>
        </div>
      </form>
    </main>
  );
}