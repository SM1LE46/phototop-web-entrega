import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { MessagesService } from '../../../core/services/messages.service';
import { AuthService } from '../../../core/services/auth.service';
import { UsersService } from '../../../core/services/users.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './chat.page.html',
  styleUrls: ['./chat.page.scss'],
})
export class ChatPage implements OnInit {
  loading = true;
  sending = false;

  otherUserId!: number;
  otherUser: any = null;
  blocked = false;

  messages: any[] = [];
  newMessage = '';

  constructor(
    private route: ActivatedRoute,
    private messagesService: MessagesService,
    private usersService: UsersService,
    public auth: AuthService
  ) {}

  ngOnInit(): void {
    this.otherUserId = Number(this.route.snapshot.paramMap.get('userId'));
    this.loadOtherUser();
    this.loadConversation();
  }

  loadOtherUser(): void {
    this.usersService.getPublicUser(this.otherUserId).subscribe({
      next: (user) => {
        this.otherUser = user;
      },
      error: (err) => {
        console.error('Error cargando usuario de la conversación', err);
        this.otherUser = null;
      }
    });
  }

  loadConversation(): void {
    this.loading = true;

    this.messagesService.getConversationWith(this.otherUserId).subscribe({
      next: (data) => {
        this.blocked = data.blocked;
        this.messages = data.messages ?? [];
        this.loading = false;

        setTimeout(() => this.scrollToBottom(), 0);
      },
      error: (err) => {
        console.error('Error cargando conversación', err);
        this.messages = [];
        this.loading = false;
      }
    });
  }

  sendMessage(): void {
    const body = this.newMessage.trim();

    if (!body || this.sending || this.blocked) return;

    this.sending = true;

    this.messagesService.sendMessage(this.otherUserId, body).subscribe({
      next: (message) => {
        this.messages.push(message);
        this.newMessage = '';
        this.sending = false;

        setTimeout(() => this.scrollToBottom(), 0);
      },
      error: (err) => {
        console.error('Error enviando mensaje', err);
        this.sending = false;
      }
    });
  }

  deleteMessage(message: any): void {
    const confirmed = window.confirm('¿Quieres borrar este mensaje solo para ti?');
    if (!confirmed) return;

    this.messagesService.deleteMessage(message.id).subscribe({
      next: () => {
        this.messages = this.messages.filter(m => m.id !== message.id);
      },
      error: (err) => {
        console.error('Error borrando mensaje', err);
      }
    });
  }

  isMine(message: any): boolean {
    return this.auth.user?.id === message.sender_id;
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

  scrollToBottom(): void {
    const el = document.getElementById('chat-messages');
    if (!el) return;

    el.scrollTop = el.scrollHeight;
  }
}