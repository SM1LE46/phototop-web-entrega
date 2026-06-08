import { Inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';

import { API_BASE_URL } from '../tokens/api-base-url.token';

interface ApiResponse<T> {
  ok: boolean;
  message?: string;
  data: T;
}

export type RankingPeriod = 'monthly' | 'yearly' | 'global';

export interface PhotographerRankingRow {
  position: number;
  id: number;
  name: string;
  surname: string;
  profile_image: string | null;
  description: string | null;
  province_id: number | null;
  province_name: string | null;
  avg_rating: number;
  ratings_count: number;
  rated_posts_count: number;
  last_rating_at: string | null;
}

export interface PhotographerRankingResponse {
  period: RankingPeriod;
  year: number | null;
  month: number | null;
  province_id: number | null;
  category_id: number | null;
  min_ratings: number;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  results: PhotographerRankingRow[];
}

export interface PhotographerRankingFilters {
  period: RankingPeriod;
  year?: number | null;
  month?: number | null;
  province_id?: number | null;
  category_id?: number | null;
  min_ratings?: number | null;
  page?: number | null;
  limit?: number | null;
}

@Injectable({
  providedIn: 'root'
})
export class RankingsService {
  constructor(
    private http: HttpClient,
    @Inject(API_BASE_URL) private apiBaseUrl: string
  ) {}

  getPhotographersRanking(filters: PhotographerRankingFilters): Observable<PhotographerRankingResponse> {
    let params = new HttpParams()
      .set('period', filters.period)
      .set('page', String(filters.page ?? 1))
      .set('limit', String(filters.limit ?? 10))
      .set('min_ratings', String(filters.min_ratings ?? 1));

    if (filters.period !== 'global' && filters.year) {
      params = params.set('year', String(filters.year));
    }

    if (filters.period === 'monthly' && filters.month) {
      params = params.set('month', String(filters.month));
    }

    if (filters.province_id) {
      params = params.set('province_id', String(filters.province_id));
    }

    if (filters.category_id) {
      params = params.set('category_id', String(filters.category_id));
    }

    return this.http
      .get<ApiResponse<PhotographerRankingResponse>>(
        `${this.apiBaseUrl}/rankings/photographers`,
        { params }
      )
      .pipe(
        map(res => ({
          ...res.data,
          page: Number(res.data.page || 1),
          limit: Number(res.data.limit || filters.limit || 10),
          total: Number(res.data.total || 0),
          totalPages: Number(res.data.totalPages || 1),
          results: (res.data.results ?? []).map(row => ({
            ...row,
            avg_rating: Number(row.avg_rating || 0),
            ratings_count: Number(row.ratings_count || 0),
            rated_posts_count: Number(row.rated_posts_count || 0),
          }))
        }))
      );
  }
}