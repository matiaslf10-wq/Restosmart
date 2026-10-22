import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// B6: ruta heredada deshabilitada.
// La aprobacion de efectivo exige autorizacion administrativa,
// pertenencia al restaurante y validacion del estado del pedido.
export async function POST() {
  return NextResponse.json(
    { error: 'Operacion no disponible.' },
    { status: 403 }
  );
}