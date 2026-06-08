import { Inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { API_BASE_URL } from '../tokens/api-base-url.token';
import { ApiResponse, Category } from '../../models/category.model';

@Injectable({
  providedIn: 'root'
})
export class CategoriesService {
  constructor(
    private http: HttpClient,
    @Inject(API_BASE_URL) private apiBaseUrl: string
  ) {}

  getCategories(): Observable<Category[]> {
    return this.http
      .get<ApiResponse<Category[]>>(`${this.apiBaseUrl}/categories`)
      .pipe(map(res => res.data ?? []));
  }

  getUserCategories(userId: number): Observable<Category[]> {
    return this.http
      .get<{ ok: boolean; data: Category[] }>(`${this.apiBaseUrl}/users/${userId}/categories`)
      .pipe(map(res => res.data ?? []));
  }
}