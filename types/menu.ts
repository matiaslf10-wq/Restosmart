export type Categoria = {
  id: number;
  nombre: string;
  orden: number | null;
};

export type MenuItem = {
  id: number;
  categoria_id: number | null;
  nombre: string;
  descripcion: string | null;
  precio: number;
  disponible: boolean;
  categoria?: Categoria;
};

export type Pedido = {
  id: number;
  mesa_id?: number | null;
  creado_en: string;
  estado: string;
  origen?: string;
  tipo_servicio?: string;
  cliente_nombre?: string | null;
  cliente_telefono?: string | null;
  direccion_entrega?: string | null;
  medio_pago?: string | null;
  estado_pago?: string;
  efectivo_aprobado?: boolean;
};