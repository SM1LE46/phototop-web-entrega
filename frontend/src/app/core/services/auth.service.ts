import { Inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, map, of, tap } from 'rxjs';
import { API_BASE_URL } from '../tokens/api-base-url.token';
import { ApiResponse, AuthLoginRequest, AuthPayload, AuthRegisterRequest } from '../../models/auth.models';
import { User } from '../../models/user.models';

const LS_TOKEN = 'phototop_token';
const LS_USER = 'phototop_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _token$ = new BehaviorSubject<string | null>(this.getStoredToken());
  private readonly _user$ = new BehaviorSubject<User | null>(this.getStoredUser());

  token$ = this._token$.asObservable();
  user$ = this._user$.asObservable();

  constructor(private http: HttpClient, @Inject(API_BASE_URL) private apiBaseUrl: string) {}

  get token(): string | null { return this._token$.value; }
  get user(): User | null { return this._user$.value; }

  isLoggedIn(): boolean { return !!this.token; }

  login(body: AuthLoginRequest): Observable<User> {
    return this.http.post<ApiResponse<AuthPayload>>(`${this.apiBaseUrl}/auth/login`, body).pipe(
      map(res => {
        if (!res.ok || !res.data?.token || !res.data?.user) throw new Error(res.message || 'Login failed');
        return res.data;
      }),
      tap(({ token, user }) => this.setSession(token, user)),
      map(({ user }) => user)
    );
  }

  register(body: AuthRegisterRequest): Observable<User> {
    return this.http.post<ApiResponse<AuthPayload>>(`${this.apiBaseUrl}/auth/register`, body).pipe(
      map(res => {
        if (!res.ok || !res.data?.token || !res.data?.user) throw new Error(res.message || 'Register failed');
        return res.data;
      }),
      tap(({ token, user }) => this.setSession(token, user)),
      map(({ user }) => user)
    );
  }

  me(): Observable<User | null> {
    if (!this.token) return of(null);

    return this.http.get<ApiResponse<User>>(`${this.apiBaseUrl}/auth/me`).pipe(
      map(res => {
        if (!res.ok || !res.data) throw new Error(res.message || 'Me failed');
        return res.data;
      }),
      tap(user => this.setUser(user)),
      catchError(() => of(null))
    );
  }

  logout(): void {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USER);
    this._token$.next(null);
    this._user$.next(null);
  }

  private setSession(token: string, user: User): void {
    localStorage.setItem(LS_TOKEN, token);
    localStorage.setItem(LS_USER, JSON.stringify(user));
    this._token$.next(token);
    this._user$.next(user);
  }

  setUser(user: User): void {
    localStorage.setItem(LS_USER, JSON.stringify(user));
    this._user$.next(user);
  }

  private getStoredToken(): string | null {
    return localStorage.getItem(LS_TOKEN);
  }

  private getStoredUser(): User | null {
    const raw = localStorage.getItem(LS_USER);
    if (!raw) return null;
    try { return JSON.parse(raw) as User; } catch { return null; }
  }
}