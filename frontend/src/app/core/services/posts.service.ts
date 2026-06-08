import { Inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../tokens/api-base-url.token';

interface ApiResponse<T> {
  ok: boolean;
  message?: string;
  data: T;
}

export interface PostListItem {
  id: number;
  title: string;
  description: string | null;
  created_at: string;
  category_id: number | null;
  category_name: string | null;
  category_slug?: string | null;

  cover_photo?: string | null;
  photos_count?: number | string;

  user_id?: number;
  name?: string;
  surname?: string;
  profile_image?: string | null;

  avg_rating?: number | string;
  ratings_count?: number | string;
}

export interface PostPage {
  posts: PostListItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PostPhoto {
  id: number;
  file_path: string;
}

export interface PostDetail {
  id: number;
  title: string;
  description: string | null;
  created_at: string;
  category_id: number | null;
  user_id: number;
  name: string;
  surname: string;
  category_name: string | null;
  category_slug?: string | null;
  photos: PostPhoto[];
  comments?: any[];
  avg_rating?: number;
  ratings_count?: number;
  my_rating?: number;
}

@Injectable({
  providedIn: 'root'
})
export class PostsService {
  constructor(
    private http: HttpClient,
    @Inject(API_BASE_URL) private apiBaseUrl: string
  ) { }

  createPost(formData: FormData): Observable<any> {
    return this.http
      .post<ApiResponse<any>>(`${this.apiBaseUrl}/posts`, formData)
      .pipe(map(res => res.data));
  }

  getPosts(limit = 12, categoryId?: number | null): Observable<PostListItem[]> {
    let params = new HttpParams().set('limit', String(limit));

    if (categoryId !== null && categoryId !== undefined) {
      params = params.set('category_id', String(categoryId));
    }

    return this.http
      .get<ApiResponse<PostListItem[]>>(`${this.apiBaseUrl}/posts`, { params })
      .pipe(map(res => this.normalizePostList(res.data)));
  }

  getPostsPage(page = 1, limit = 6, categoryId?: number | null): Observable<PostPage> {
    let params = new HttpParams()
      .set('page', String(page))
      .set('limit', String(limit));

    if (categoryId !== null && categoryId !== undefined) {
      params = params.set('category_id', String(categoryId));
    }

    return this.http
      .get<ApiResponse<{
        posts: PostListItem[];
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      }>>(`${this.apiBaseUrl}/posts`, { params })
      .pipe(
        map(res => ({
          posts: this.normalizePostList(res.data?.posts),
          page: Number(res.data?.page || page),
          limit: Number(res.data?.limit || limit),
          total: Number(res.data?.total || 0),
          totalPages: Number(res.data?.totalPages || 1),
        }))
      );
  }

  getMyPosts(): Observable<PostListItem[]> {
    return this.http
      .get<ApiResponse<PostListItem[]>>(`${this.apiBaseUrl}/users/me/posts`)
      .pipe(map(res => this.normalizePostList(res.data)));
  }

  getMyPostsPage(page = 1, limit = 6): Observable<PostPage> {
    const params = new HttpParams()
      .set('page', String(page))
      .set('limit', String(limit));

    return this.http
      .get<ApiResponse<{
        posts: PostListItem[];
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      }>>(`${this.apiBaseUrl}/users/me/posts`, { params })
      .pipe(
        map(res => ({
          posts: this.normalizePostList(res.data?.posts),
          page: Number(res.data?.page || page),
          limit: Number(res.data?.limit || limit),
          total: Number(res.data?.total || 0),
          totalPages: Number(res.data?.totalPages || 1),
        }))
      );
  }

  getUserPosts(userId: number): Observable<PostListItem[]> {
    return this.http
      .get<ApiResponse<PostListItem[]>>(`${this.apiBaseUrl}/users/${userId}/posts`)
      .pipe(map(res => this.normalizePostList(res.data)));
  }

  getUserPostsPage(userId: number, page = 1, limit = 6): Observable<PostPage> {
    const params = new HttpParams()
      .set('page', String(page))
      .set('limit', String(limit));

    return this.http
      .get<ApiResponse<{
        posts: PostListItem[];
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      }>>(`${this.apiBaseUrl}/users/${userId}/posts`, { params })
      .pipe(
        map(res => ({
          posts: this.normalizePostList(res.data?.posts),
          page: Number(res.data?.page || page),
          limit: Number(res.data?.limit || limit),
          total: Number(res.data?.total || 0),
          totalPages: Number(res.data?.totalPages || 1),
        }))
      );
  }

  getPostById(id: number): Observable<PostDetail> {
    return this.http
      .get<ApiResponse<PostDetail>>(`${this.apiBaseUrl}/posts/${id}`)
      .pipe(
        map(res => ({
          ...res.data,
          avg_rating: Number(res.data.avg_rating || 0),
          ratings_count: Number(res.data.ratings_count || 0),
        }))
      );
  }

  addComment(postId: number, comment: string) {
    return this.http.post<{ ok: boolean; message?: string; data: any }>(
      `${this.apiBaseUrl}/posts/${postId}/comments`,
      { comment }
    );
  }

  deletePost(id: number) {
    return this.http.delete<{ ok: boolean; message: string }>(
      `${this.apiBaseUrl}/posts/${id}`
    );
  }

  updateComment(commentId: number, comment: string) {
    return this.http.patch<{ ok: boolean; message?: string; data: any }>(
      `${this.apiBaseUrl}/posts/comments/${commentId}`,
      { comment }
    );
  }

  deleteComment(commentId: number) {
    return this.http.delete<{ ok: boolean; message?: string }>(
      `${this.apiBaseUrl}/posts/comments/${commentId}`
    );
  }

  ratePost(postId: number, rating: number) {
    return this.http.post<{ ok: boolean; message?: string; data: any }>(
      `${this.apiBaseUrl}/posts/${postId}/rating`,
      { rating }
    );
  }

  getMyRating(postId: number) {
    return this.http.get<{ ok: boolean; data: { my_rating: number } }>(
      `${this.apiBaseUrl}/posts/${postId}/my-rating`
    );
  }

  private normalizePostList(posts: PostListItem[] | null | undefined): PostListItem[] {
    return (posts ?? []).map(post => ({
      ...post,
      photos_count: Number(post.photos_count ?? 0),
      avg_rating: Number(post.avg_rating ?? 0),
      ratings_count: Number(post.ratings_count ?? 0),
    }));
  }
}