import 'server-only';
import { createHash, randomUUID } from 'crypto';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export class ImageInputError extends Error {}
export async function readAdminImage(request: { headers: Headers; body?: ReadableStream<Uint8Array> | null; formData(): Promise<FormData> }) {
  if (Number(request.headers.get('content-length')) > MAX_IMAGE_BYTES + 65536) throw new ImageInputError('Archivo demasiado grande (máximo 5 MiB).');
  // Bound the real HTTP body before multipart parsing, including absent/false Content-Length.
  let form: FormData;
  if (request.body) {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = []; let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES + 65536) { await reader.cancel(); throw new ImageInputError('Archivo demasiado grande (m?ximo 5 MiB).'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    try { form = await new Response(Buffer.concat(chunks), { headers: request.headers }).formData(); }
    catch { throw new ImageInputError('Formulario de imagen inv?lido.'); }
  } else {
    try { form = await request.formData(); }
    catch { throw new ImageInputError('Formulario de imagen inv?lido.'); }
  }
  if ([...form.keys()].some(key => key !== 'file')) throw new ImageInputError('Campos de subida no admitidos.');
  const file = form.get('file');
  if (!file || typeof file === 'string' || form.getAll('file').length !== 1 || file.size === 0 || file.size > MAX_IMAGE_BYTES) throw new ImageInputError('Archivo vacío o demasiado grande (máximo 5 MiB).');
  const bytes = Buffer.from(await file.arrayBuffer());
  let ext: string, mime: string;
  if (bytes.length >= 12 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) { ext = 'png'; mime = 'image/png'; }
  else if (bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) { ext = 'jpg'; mime = 'image/jpeg'; }
  else if (bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16))) { ext = 'webp'; mime = 'image/webp'; }
  else throw new ImageInputError('Solo se admiten JPEG, PNG y WebP con firma válida.');
  if (file.type !== mime) throw new ImageInputError('El MIME no coincide con el contenido.');
  return { bytes, ext, mime };
}
export function adminImagePath(tenantId: string, kind: 'productos' | 'marcas', id: string | number, ext: string) {
  const tenant = createHash('sha256').update(tenantId).digest('hex');
  const entity = createHash('sha256').update(String(id)).digest('hex');
  return `tenants/${tenant}/${kind}/${entity}/${randomUUID()}.${ext}`;
}
// Physical deletion is deliberately deferred: without a DB lock/transaction a
// reference scan can race another writer. Historical/shared objects are retained.
export const STORAGE_CLEANUP = 'deferred' as const;
