import { Inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../tokens/api-base-url.token';

export interface UserCategory {
  id: number;
  name: string;
  slug: string;
}

export interface UserProfile {
  id: number;
  name: string;
  surname: string;
  email: string;
  province_id: number | null;
  province_name?: string | null;
  description: string | null;
  phone: string | null;
  profile_image: string | null;
  admin: number;
  photographer: number;
  model: number;
  active: number;
  created_at: string;
  updated_at: string;
  categories?: UserCategory[];

  avg_rating?: number;
  ratings_count?: number;
  followers_count?: number;
  following_count?: number;
}

export interface FollowUser {
  id: number;
  name: string;
  surname: string;
  profile_image: string | null;
  province_id: number | null;
  province_name: string | null;
  photographer: number;
  model: number;
  avg_rating: number;
  ratings_count: number;
  followed_at: string;
}

interface ApiResponse<T> {
  ok: boolean;
  message?: string;
  data: T;
}

@Injectable({
  providedIn: 'root'
})
export class UsersService {
  constructor(
    private http: HttpClient,
    @Inject(API_BASE_URL) private apiBaseUrl: string
  ) { }

  getMe(): Observable<UserProfile> {
    return this.http
      .get<ApiResponse<UserProfile>>(`${this.apiBaseUrl}/users/me`)
      .pipe(map(res => this.normalizeUserProfile(res.data)));
  }

  updateMe(payload: {
    name?: string;
    surname?: string;
    description?: string | null;
    phone?: string | null;
    province_id?: number | null;
    photographer?: boolean;
    model?: boolean;
  }): Observable<UserProfile> {
    return this.http
      .patch<ApiResponse<UserProfile>>(`${this.apiBaseUrl}/users/me`, payload)
      .pipe(map(res => this.normalizeUserProfile(res.data)));
  }

  uploadAvatar(file: File): Observable<UserProfile> {
    const formData = new FormData();
    formData.append('avatar', file);

    return this.http
      .post<ApiResponse<UserProfile>>(
        `${this.apiBaseUrl}/users/me/avatar`,
        formData
      )
      .pipe(map(res => this.normalizeUserProfile(res.data)));
  }

  removeAvatar(): Observable<UserProfile> {
    return this.http
      .delete<ApiResponse<UserProfile>>(`${this.apiBaseUrl}/users/me/avatar`)
      .pipe(map(res => this.normalizeUserProfile(res.data)));
  }

  updateMyCategories(categoryIds: number[]) {
    return this.http.put<any>(`${this.apiBaseUrl}/users/me/categories`, {
      category_ids: categoryIds
    });
  }

  getById(userId: number) {
    return this.http.get<{ ok: boolean; data: any }>(`${this.apiBaseUrl}/users/${userId}`);
  }

  getPublicUser(userId: number) {
    return this.http
      .get<{ ok: boolean; data: any }>(`${this.apiBaseUrl}/users/${userId}`)
      .pipe(map(res => res.data));
  }

  getFollowStatus(userId: number) {
    return this.http
      .get<{ ok: boolean; data: { is_following: boolean } }>(
        `${this.apiBaseUrl}/users/${userId}/follow-status`
      )
      .pipe(map(res => res.data));
  }

  followUser(userId: number) {
    return this.http
      .post<{ ok: boolean; data: { is_following: boolean } }>(
        `${this.apiBaseUrl}/users/${userId}/follow`,
        {}
      )
      .pipe(map(res => res.data));
  }

  unfollowUser(userId: number) {
    return this.http
      .delete<{ ok: boolean; data: { is_following: boolean } }>(
        `${this.apiBaseUrl}/users/${userId}/follow`
      )
      .pipe(map(res => res.data));
  }

  getUserFollowers(userId: number): Observable<FollowUser[]> {
    return this.http
      .get<ApiResponse<FollowUser[]>>(`${this.apiBaseUrl}/users/${userId}/followers`)
      .pipe(map(res => (res.data ?? []).map(user => this.normalizeFollowUser(user))));
  }

  getUserFollowing(userId: number): Observable<FollowUser[]> {
    return this.http
      .get<ApiResponse<FollowUser[]>>(`${this.apiBaseUrl}/users/${userId}/following`)
      .pipe(map(res => (res.data ?? []).map(user => this.normalizeFollowUser(user))));
  }

  private normalizeUserProfile(user: UserProfile): UserProfile {
    return {
      ...user,
      avg_rating: Number(user.avg_rating || 0),
      ratings_count: Number(user.ratings_count || 0),
      followers_count: Number(user.followers_count || 0),
      following_count: Number(user.following_count || 0),
    };
  }

  private normalizeFollowUser(user: FollowUser): FollowUser {
    return {
      ...user,
      avg_rating: Number(user.avg_rating || 0),
      ratings_count: Number(user.ratings_count || 0),
    };
  }
}
