import { Inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { API_BASE_URL } from '../tokens/api-base-url.token';

interface ApiResponse<T> {
  ok: boolean;
  message?: string;
  data: T;
}

/* =========================
   USERS
========================= */

export interface AdminUserRow {
  id: number;
  name: string;
  surname: string;
  email: string;
  admin: number;
  photographer: number;
  model: number;
  active: number;
  deleted_at: string | null;
  created_at: string;
}

interface AdminUsersResponseData {
  q: string | null;
  role: string | null;
  province_id: number | null;
  active: number | null;
  deleted: number | null;
  page: number;
  limit: number;
  total: number;
  results: AdminUserRow[];
}

/* =========================
   REPORTS
========================= */

export interface AdminReportRow {
  id: number;
  reporter_id: number;
  reporter_name: string;
  reporter_surname: string;
  reporter_email: string;
  target_type: 'user' | 'post' | 'message';
  target_id: number;
  reason: string;
  details: string | null;
  status: 'open' | 'reviewing' | 'closed';
  admin_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface AdminReportsResponseData {
  status: string | null;
  target_type: string | null;
  page: number;
  limit: number;
  total: number;
  results: AdminReportRow[];
}

export interface AdminReportDetail {
  report: AdminReportRow;
  target: any;
}

/* =========================
   SERVICE
========================= */

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  constructor(
    private http: HttpClient,
    @Inject(API_BASE_URL) private apiBaseUrl: string
  ) {}

  /* =========================
     USERS
  ========================= */

  getUsers(filters?: {
    q?: string;
    role?: string;
    status?: string;
  }): Observable<AdminUserRow[]> {
    let params = new HttpParams();

    if (filters?.q && filters.q.trim() !== '') {
      params = params.set('q', filters.q.trim());
    }

    if (filters?.role && filters.role.trim() !== '') {
      params = params.set('role', filters.role);
    }

    if (filters?.status === 'active') {
      params = params.set('deleted', '0');
      params = params.set('active', '1');
    } else if (filters?.status === 'deleted') {
      params = params.set('deleted', '1');
    }

    return this.http
      .get<ApiResponse<AdminUsersResponseData>>(`${this.apiBaseUrl}/admin/users`, { params })
      .pipe(map(res => res.data?.results ?? []));
  }

  deleteUser(userId: number) {
    return this.http.delete<ApiResponse<any>>(
      `${this.apiBaseUrl}/admin/users/${userId}`
    );
  }

  restoreUser(userId: number) {
    return this.http.patch<ApiResponse<any>>(
      `${this.apiBaseUrl}/admin/users/${userId}/restore`,
      {}
    );
  }

  /* =========================
     REPORTS
  ========================= */

  getReports(filters?: {
    status?: string;
    target_type?: string;
  }): Observable<AdminReportRow[]> {
    let params = new HttpParams();

    if (filters?.status && filters.status.trim() !== '') {
      params = params.set('status', filters.status);
    }

    if (filters?.target_type && filters.target_type.trim() !== '') {
      params = params.set('target_type', filters.target_type);
    }

    return this.http
      .get<ApiResponse<AdminReportsResponseData>>(`${this.apiBaseUrl}/admin/reports`, { params })
      .pipe(map(res => res.data?.results ?? []));
  }

  getReportById(reportId: number): Observable<AdminReportDetail> {
    return this.http
      .get<ApiResponse<AdminReportDetail>>(`${this.apiBaseUrl}/admin/reports/${reportId}`)
      .pipe(map(res => res.data));
  }

  updateReport(
    reportId: number,
    payload: {
      status: 'open' | 'reviewing' | 'closed';
      admin_reason?: string | null;
    }
  ) {
    return this.http.patch<ApiResponse<any>>(
      `${this.apiBaseUrl}/admin/reports/${reportId}`,
      payload
    );
  }

  resolveReport(
    reportId: number,
    payload: {
      action: 'close_only' | 'hide_target' | 'delete_target' | 'deactivate_user';
      admin_reason: string;
    }
  ) {
    return this.http.post<ApiResponse<any>>(
      `${this.apiBaseUrl}/admin/reports/${reportId}/resolve`,
      payload
    );
  }

  deleteReport(reportId: number) {
    return this.http.delete<ApiResponse<any>>(
      `${this.apiBaseUrl}/admin/reports/${reportId}`
    );
  }
}