import { User } from './user.models';

export interface AuthLoginRequest {
  email: string;
  password: string;
}

export interface AuthRegisterRequest {
  name: string;
  surname: string;
  email: string;
  password: string;
  province_id?: number | null;
  description?: string | null;
  photographer: boolean;
  model: boolean;
  category_ids?: number[];
}

export interface ApiResponse<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

export interface AuthPayload {
  token: string;
  user: User;
}

