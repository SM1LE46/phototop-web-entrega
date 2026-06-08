import { Inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';

import { API_BASE_URL } from '../tokens/api-base-url.token';
import { Province, ProvinceApiResponse } from '../../models/province.model';

@Injectable({
  providedIn: 'root'
})
export class ProvincesService {
  constructor(
    private http: HttpClient,
    @Inject(API_BASE_URL) private apiBaseUrl: string
  ) {}

  getProvinces(): Observable<Province[]> {
    return this.http
      .get<ProvinceApiResponse>(`${this.apiBaseUrl}/provinces`)
      .pipe(
        map(res => res.data ?? [])
      );
  }
}