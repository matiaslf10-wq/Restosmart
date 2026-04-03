export type DeliveryConversationState =
  | 'inicio'
  | 'viendo_menu'
  | 'armando_carrito'
  | 'pidiendo_nombre'
  | 'pidiendo_direccion'
  | 'pidiendo_pago'
  | 'esperando_pago'
  | 'esperando_aprobacion_efectivo'
  | 'confirmado';

export type DeliveryConfig = {
  id?: number;
  activo: boolean;
  whatsapp_numero: string | null;
  whatsapp_nombre_mostrado: string | null;
  acepta_efectivo: boolean;
  efectivo_requiere_aprobacion: boolean;
  acepta_mercadopago: boolean;
  mensaje_bienvenida: string | null;
  tiempo_estimado_min: number | null;
  costo_envio: number;
};

export type DeliveryCartItem = {
  producto_id: number;
  nombre: string;
  precio: number;
  cantidad: number;
};

export type DeliveryConversation = {
  id: number;
  telefono: string;
  estado: DeliveryConversationState;
  nombre_cliente: string | null;
  direccion: string | null;
  notas: string | null;
  carrito: DeliveryCartItem[];
  medio_pago: 'mercadopago' | 'efectivo' | null;
  pedido_id: number | null;
  ultimo_mensaje_cliente: string | null;
};