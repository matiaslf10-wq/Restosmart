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
