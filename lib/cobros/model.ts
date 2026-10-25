export type Method = { kind: 'transferencia' | 'mercadopago' | 'externo' | 'efectivo'; label: string; alias?: string; account?: string; holder?: string; instructions?: string; url?: string };
export type CollectionConfig = { methods: Method[]; require_payment: boolean };

export function validPaymentUrl(raw: string, kind: string): string {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !host.includes('.') || host.endsWith('.local') || host.endsWith('.localhost') ||
      host.includes(':') || /^\d+(\.\d+)*$/.test(host) || host.startsWith('127.') || host === 'localhost') throw new Error('URL HTTPS pública inválida.');
  if (kind === 'mercadopago' && !['mpago.la', 'mercadopago.com', 'mercadopago.com.ar'].some(domain => host === domain || host.endsWith(`.${domain}`))) throw new Error('Usá un link de Mercado Pago del comercio.');
  return url.href;
}

export function validateConfig(value: unknown): CollectionConfig {
  if (!value || typeof value !== 'object') throw new Error('Configuración inválida.');
  const input = value as CollectionConfig;
  if (typeof input.require_payment !== 'boolean' || !Array.isArray(input.methods) || input.methods.length > 4) throw new Error('Configuración inválida.');
  const seen = new Set<string>();
  const methods = input.methods.map(raw => {
    if (!raw || !['transferencia', 'mercadopago', 'externo', 'efectivo'].includes(raw.kind) || seen.has(raw.kind)) throw new Error('Medio inválido o duplicado.');
    seen.add(raw.kind);
    const method: Method = { kind: raw.kind, label: String(raw.label || raw.kind).trim().slice(0, 100) };
    for (const key of ['alias', 'account', 'holder', 'instructions'] as const) {
      if (raw[key] != null && typeof raw[key] !== 'string') throw new Error('Texto inválido.');
      if (raw[key]) method[key] = raw[key].trim().slice(0, key === 'instructions' ? 1000 : 150);
    }
    if (method.account && !/^\d{22}$/.test(method.account)) throw new Error('CBU/CVU inválido.');
    if (raw.kind === 'transferencia' && ((!method.alias && !/^\d{22}$/.test(method.account || '')) || !method.holder)) throw new Error('Transferencia requiere alias o CBU/CVU de 22 dígitos y titular.');
    if (raw.kind === 'externo' || raw.kind === 'mercadopago') method.url = validPaymentUrl(String(raw.url || ''), raw.kind);
    return method;
  });
  return { methods, require_payment: input.require_payment };
}

export function effectiveConfig(tenant: CollectionConfig | null, branch: CollectionConfig | null): CollectionConfig | null {
  return branch ?? tenant;
}

export function canTransition(state: string, action: string, kind: string) {
  return action === 'declare' ? state === 'pending' && kind !== 'efectivo' :
    action === 'confirm' ? state === 'declared' || (state === 'pending' && kind === 'efectivo') :
    action === 'incident' && (state === 'pending' || state === 'declared');
}
