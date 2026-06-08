export interface User {
  id: number;
  name: string;
  surname: string;
  email: string;

  admin: number | boolean;
  photographer: number | boolean;
  model: number | boolean;

  profile_image?: string | null;
  description?: string | null;
  phone?: string | null;
  province_id?: number | null;
}