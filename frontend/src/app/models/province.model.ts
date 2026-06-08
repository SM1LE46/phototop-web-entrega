export interface Province {
  id: number;
  name: string;
}

export interface ProvinceApiResponse {
  ok: boolean;
  data: Province[];
  message?: string;
}