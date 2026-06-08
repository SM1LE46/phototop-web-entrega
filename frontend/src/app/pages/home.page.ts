import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/services/auth.service';

import { PostsService, PostListItem } from '../core/services/posts.service';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage implements OnInit {
  loading = true;
  loadingPosts = false;

  posts: PostListItem[] = [];

  postsPage = 1;
  postsLimit = 8;
  postsTotal = 0;
  postsTotalPages = 1;

  constructor(
    private postsService: PostsService,
    public auth: AuthService
  ) { }

  ngOnInit(): void {
    this.loadPosts(1);
  }

  loadPosts(page = 1): void {
    this.loadingPosts = true;

    if (this.posts.length === 0) {
      this.loading = true;
    }

    this.postsService.getPostsPage(page, this.postsLimit).subscribe({
      next: (res) => {
        this.posts = res.posts;
        this.postsPage = res.page;
        this.postsLimit = res.limit;
        this.postsTotal = res.total;
        this.postsTotalPages = res.totalPages;

        this.loadingPosts = false;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error cargando últimos posts', err);
        this.posts = [];
        this.postsTotal = 0;
        this.postsTotalPages = 1;

        this.loadingPosts = false;
        this.loading = false;
      }
    });
  }

  goToPostsPage(page: number): void {
    if (page < 1 || page > this.postsTotalPages || page === this.postsPage) return;

    this.loadPosts(page);

    setTimeout(() => {
      document.querySelector('.home-section')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }, 50);
  }

  nextPostsPage(): void {
    this.goToPostsPage(this.postsPage + 1);
  }

  prevPostsPage(): void {
    this.goToPostsPage(this.postsPage - 1);
  }

  toNumber(value: number | string | null | undefined): number {
    return Number(value || 0);
  }

  getPostCoverUrl(post: PostListItem): string | null {
    if (!post.cover_photo) return null;

    if (post.cover_photo.startsWith('http://') || post.cover_photo.startsWith('https://')) {
      return post.cover_photo;
    }

    return `/${post.cover_photo.replace(/^\/+/, '')}`;
  }

  hasProfileImage(url: string | null | undefined): boolean {
    return !!url && url.trim() !== '';
  }

  getProfileImage(url: string | null | undefined): string {
    if (!url || url.trim() === '') return '';

    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    return `/${url.replace(/^\/+/, '')}`;
  }

  getInitial(name: string | null | undefined): string {
    if (!name || !name.trim()) return '?';
    return name.trim().charAt(0).toUpperCase();
  }
}