import { Inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map } from 'rxjs';
import { API_BASE_URL } from '../tokens/api-base-url.token';

@Injectable({ providedIn: 'root' })
export class MessagesService {
  constructor(
    private http: HttpClient,
    @Inject(API_BASE_URL) private apiBaseUrl: string
  ) {}

  getConversations() {
    return this.http
      .get<{ ok: boolean; data: any[] }>(`${this.apiBaseUrl}/messages/conversations`)
      .pipe(map(res => res.data ?? []));
  }

  getConversationWith(userId: number) {
    return this.http
      .get<{ ok: boolean; data: { blocked: boolean; messages: any[] } }>(
        `${this.apiBaseUrl}/messages/with/${userId}`
      )
      .pipe(map(res => res.data));
  }

  sendMessage(userId: number, body: string) {
    return this.http
      .post<{ ok: boolean; message?: string; data: any }>(
        `${this.apiBaseUrl}/messages/with/${userId}`,
        { body }
      )
      .pipe(map(res => res.data));
  }

  deleteMessage(messageId: number) {
    return this.http.delete<{ ok: boolean; message?: string }>(
      `${this.apiBaseUrl}/messages/${messageId}`
    );
  }
}