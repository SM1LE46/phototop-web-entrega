import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { MessagesService } from '../../../core/services/messages.service';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './conversations.page.html',
  styleUrls: ['./conversations.page.scss'],
})
export class ConversationsPage implements OnInit {
  loading = true;
  conversations: any[] = [];

  constructor(private messagesService: MessagesService) {}

  ngOnInit(): void {
    this.loadConversations();
  }

  loadConversations(): void {
    this.loading = true;

    this.messagesService.getConversations().subscribe({
      next: (conversations) => {
        this.conversations = conversations;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error cargando conversaciones', err);
        this.conversations = [];
        this.loading = false;
      }
    });
  }

  hasProfileImage(url: string | null): boolean {
    return !!url && url.trim() !== '';
  }

  getProfileImage(url: string | null): string {
    if (!url || url.trim() === '') return '';

    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    return `http://localhost:3000/${url.replace(/^\/+/, '')}`;
  }

  getInitial(name: string | null | undefined): string {
    if (!name || !name.trim()) return '?';
    return name.trim().charAt(0).toUpperCase();
  }
}