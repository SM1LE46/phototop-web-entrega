import { Inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../tokens/api-base-url.token';

export type ReportTargetType = 'user' | 'post' | 'comment';

@Injectable({
  providedIn: 'root'
})
export class ReportsService {
  constructor(
    private http: HttpClient,
    @Inject(API_BASE_URL) private apiBaseUrl: string
  ) {}

  createReport(data: {
    target_type: ReportTargetType;
    target_id: number;
    reason: string;
    details: string;
  }) {
    return this.http.post<{ ok: boolean; message?: string; data?: any }>(
      `${this.apiBaseUrl}/reports`,
      data
    );
  }
}