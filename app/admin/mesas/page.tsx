'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import QRCode from 'react-qr-code';

const DELIVERY_MESA_ID = 0;

type Mesa = {
  id: number;
  nombre: string;
};

export default function AdminMesasPage() {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [baseUrl, setBaseUrl] = useState<string>('');

  const [nuevoNombre, setNuevoNombre] = useState('');
  const [creando, setCreando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin);
    }

    const cargarMesas = async () => {
      setCargando(true);
      setError(null);

      const { data, error } = await supabase
        .from('mesas')
        .select('*')
        .gt('id', DELIVERY_MESA_ID)
        .order('id', { ascending: true });

      if (!error && data) {
        setMesas(data as Mesa[]);
      } else if (error) {
        console.error('Error cargando mesas:', error);
        setError('No se pudieron cargar las mesas.');
      }

      setCargando(false);
    };

    cargarMesas();
  }, []);

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handleCrearMesa = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje(null);
    setError(null);

    const nombreLimpio = nuevoNombre.trim();
    if (!nombreLimpio) {
      setError('El nombre de la mesa no puede estar vacío.');
      return;
    }

    setCreando(true);

    try {
      const { data, error } = await supabase
        .from('mesas')
        .insert({
          nombre: nombreLimpio,
        })
        .select('*')
        .single();

      if (error) {
        console.error('Error creando mesa:', error);
        setError('No se pudo crear la mesa. Revisá la consola.');
        setCreando(false);
        return;
      }

      const mesaNueva = data as Mesa;

      if (mesaNueva.id <= DELIVERY_MESA_ID) {
        setMensaje(
          `Se creó la mesa "${mesaNueva.nombre}", pero no se mostrará acá porque la mesa ${DELIVERY_MESA_ID} está reservada para delivery.`
        );
        setNuevoNombre('');
        return;
      }

      setMesas((prev) => [...prev, mesaNueva].sort((a, b) => a.id - b.id));
      setNuevoNombre('');
      setMensaje(`Mesa "${mesaNueva.nombre}" creada con éxito (ID ${mesaNueva.id}).`);
    } finally {
      setCreando(false);
    }
  };

  if (cargando) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>Cargando mesas...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 print:bg-white">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-col gap-2 print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h1 className="text-2xl font-bold">Administración de mesas</h1>
            <button
              onClick={handlePrint}
              className="px-3 py-1 rounded-lg bg-slate-800 text-white text-sm hover:bg-slate-700"
            >
              Imprimir todos los QR
            </button>
          </div>
          <p className="text-sm text-slate-600">
            Cada QR apunta a <code>/mesa/[id]</code> en este sitio.
          </p>
          <p className="text-sm text-slate-600">
            La mesa #{DELIVERY_MESA_ID} está reservada para delivery y no se muestra
            en este listado ni en los QR del salón.
          </p>
        </header>

        {mensaje && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg print:hidden">
            {mensaje}
          </p>
        )}
        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg print:hidden">
            {error}
          </p>
        )}

        <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3 print:hidden">
          <h2 className="text-lg font-semibold">Agregar nueva mesa</h2>
          <form
            onSubmit={handleCrearMesa}
            className="flex flex-col sm:flex-row gap-2"
          >
            <input
              type="text"
              placeholder="Ej: Mesa 1, Terraza, VIP..."
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={creando}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
            >
              {creando ? 'Creando...' : 'Agregar mesa'}
            </button>
          </form>
          <p className="text-xs text-slate-500">
            El ID se genera automáticamente en la base de datos. Cada mesa nueva tendrá su propio QR.
            La mesa #{DELIVERY_MESA_ID} queda reservada para delivery.
          </p>
        </section>

        {mesas.length === 0 ? (
          <p className="text-slate-600">
            No hay mesas físicas cargadas en la base de datos.
          </p>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2">
            {mesas.map((mesa) => {
              const url = baseUrl
                ? `${baseUrl}/mesa/${mesa.id}`
                : `/mesa/${mesa.id}`;

              return (
                <article
                  key={mesa.id}
                  className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm flex flex-col items-center gap-3 print:shadow-none"
                >
                  <h2 className="font-semibold text-lg text-center">
                    {mesa.nombre}
                    <br />
                    <span className="text-sm text-slate-500">
                      Mesa #{mesa.id}
                    </span>
                  </h2>

                  <div className="bg-white p-2 rounded-md border border-slate-200">
                    <QRCode value={url} size={180} />
                  </div>

                  <p className="text-xs text-slate-600 break-all text-center">
                    {url}
                  </p>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}