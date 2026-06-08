export interface Category {
  id: number;
  name: string;
  slug: string;
}

export interface ApiResponse<T> {
  ok: boolean;
  data: T;
  message?: string;
}