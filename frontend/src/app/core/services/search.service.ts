import { Inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';

import { API_BASE_URL } from '../tokens/api-base-url.token';

interface ApiResponse<T> {
  ok: boolean;
  message?: string;
  data: T;
}

export interface PhotographerRow {
  id: number;
  name: string;
  surname: string;
  email: string;
  profile_image: string | null;
  description: string | null;
  province_id: number | null;
  province_name: string | null;
  photographer: number;
  model: number;
  avg_rating: number | null;
  ratings_count: number;
  categories: string | null;
}

export interface PhotographerPage {
  photographers: PhotographerRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface SearchUsersResponseData {
  q: string | null;
  province_id: number | null;
  type: string;
  category_ids: number[] | null;
  category_mode: string;
  min_rating: number | null;
  page: number;
  limit: number;
  total: number;
  results: Array<{
    id: number;
    name: string;
    surname: string;
    email: string;
    profile_image: string | null;
    description: string | null;
    province_id: number | null;
    province_name: string | null;
    photographer: number;
    model: number;
    avg_rating: number | string | null;
    ratings_count: number | string;
    categories: string | null;
  }>;
}

export interface PhotographerFilters {
  q?: string;
  province_id?: number | null;
  category_ids?: number[];
  min_rating?: number | null;
  exclude_user_id?: number | null;
  page?: number;
  limit?: number;
}

@Injectable({
  providedIn: 'root'
})
export class SearchService {
  constructor(
    private http: HttpClient,
    @Inject(API_BASE_URL) private apiBaseUrl: string
  ) { }

  getPhotographers(filters?: PhotographerFilters): Observable<PhotographerRow[]> {
    return this.getPhotographersPage(filters).pipe(
      map(res => res.photographers)
    );
  }

  getPhotographersPage(filters?: PhotographerFilters): Observable<PhotographerPage> {
    let params = new HttpParams().set('type', 'photographer');

    if (filters?.q && filters.q.trim() !== '') {
      params = params.set('q', filters.q.trim());
    }

    if (filters?.province_id !== null && filters?.province_id !== undefined) {
      params = params.set('province_id', String(filters.province_id));
    }

    if (filters?.category_ids && filters.category_ids.length > 0) {
      params = params.set('category_ids', filters.category_ids.join(','));
      params = params.set('category_mode', 'any');
    }

    if (filters?.min_rating !== null && filters?.min_rating !== undefined) {
      params = params.set('min_rating', String(filters.min_rating));
    }

    if (filters?.exclude_user_id !== null && filters?.exclude_user_id !== undefined) {
      params = params.set('exclude_user_id', String(filters.exclude_user_id));
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 6;

    params = params.set('page', String(page));
    params = params.set('limit', String(limit));

    return this.http
      .get<ApiResponse<SearchUsersResponseData>>(`${this.apiBaseUrl}/search/users`, { params })
      .pipe(
        map(res => {
          const data = res.data;

          const normalizedPhotographers = (data?.results ?? []).map(item => ({
            ...item,
            avg_rating: item.avg_rating !== null && item.avg_rating !== undefined
              ? Number(item.avg_rating)
              : null,
            ratings_count: Number(item.ratings_count ?? 0),
          }));

          const normalizedPage = Number(data?.page || page);
          const normalizedLimit = Number(data?.limit || limit);
          const normalizedTotal = Number(data?.total || 0);
          const totalPages = Math.max(1, Math.ceil(normalizedTotal / normalizedLimit));

          return {
            photographers: normalizedPhotographers,
            page: normalizedPage,
            limit: normalizedLimit,
            total: normalizedTotal,
            totalPages,
          };
        })
      );
  }
}