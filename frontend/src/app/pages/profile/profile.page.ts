import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { UsersService, UserProfile } from '../../core/services/users.service';
import { PostsService } from '../../core/services/posts.service';
import { CategoriesService } from '../../core/services/categories.service';
import { Category } from '../../models/category.model';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss',
})
export class ProfilePage implements OnInit {
  loading = true;
  loadingPosts = false;
  uploadingAvatar = false;

  user: UserProfile | null = null;
  posts: any[] = [];
  userCategories: Category[] = [];

  postsPage = 1;
  postsLimit = 6;
  postsTotal = 0;
  postsTotalPages = 1;

  stats = {
    posts: 0,
    followers: 0,
    following: 0
  };

  constructor(
    private auth: AuthService,
    private router: Router,
    private usersService: UsersService,
    private postsService: PostsService,
    private categoriesService: CategoriesService
  ) { }

  ngOnInit(): void {
    if (!this.auth.user) {
      this.router.navigateByUrl('/auth/login');
      return;
    }

    this.loadProfile();
  }

  loadProfile(): void {
    this.usersService.getMe().subscribe({
      next: (user) => {
        this.user = user;
        this.auth.setUser(user as any);

        this.stats.followers = Number(user.followers_count || 0);
        this.stats.following = Number(user.following_count || 0);

        this.loadMyPosts(1);
        this.loadUserCategories();
      },
      error: (err) => {
        console.error('Error cargando perfil', err);
        this.loading = false;
      }
    });
  }

  loadMyPosts(page = 1): void {
    this.loadingPosts = true;

    this.postsService.getMyPostsPage(page, this.postsLimit).subscribe({
      next: (res) => {
        this.posts = res.posts;
        this.postsPage = res.page;
        this.postsLimit = res.limit;
        this.postsTotal = res.total;
        this.postsTotalPages = res.totalPages;

        this.stats.posts = res.total;

        this.loadingPosts = false;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error cargando publicaciones', err);
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

    this.loadMyPosts(page);

    setTimeout(() => {
      document.getElementById('profile-posts')?.scrollIntoView({
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

  loadUserCategories(): void {
    if (!this.user?.id || !this.user.photographer) {
      this.userCategories = [];
      return;
    }

    this.categoriesService.getUserCategories(this.user.id).subscribe({
      next: (categories) => {
        this.userCategories = categories;
      },
      error: (err) => {
        console.error('Error cargando categorías del usuario', err);
        this.userCategories = [];
      }
    });
  }

  get fullName(): string {
    if (!this.user) return '';
    return `${this.user.name || ''} ${this.user.surname || ''}`.trim();
  }

  get userInitial(): string {
    return this.user?.name?.charAt(0)?.toUpperCase() || 'U';
  }

  get profileImageUrl(): string | null {
    if (!this.user?.profile_image) return null;

    if (this.user.profile_image.startsWith('http')) {
      return this.user.profile_image;
    }

    return `http://localhost:3000${this.user.profile_image}`;
  }

  getPostCoverUrl(post: any): string | null {
    if (!post?.cover_photo) return null;

    if (post.cover_photo.startsWith('http')) {
      return post.cover_photo;
    }

    return `http://localhost:3000${post.cover_photo}`;
  }

  onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;

    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];
    this.uploadingAvatar = true;

    this.usersService.uploadAvatar(file).subscribe({
      next: (updatedUser) => {
        this.user = updatedUser;
        this.auth.setUser(updatedUser as any);
        this.uploadingAvatar = false;
        input.value = '';
      },
      error: (err) => {
        console.error('Error subiendo avatar', err);
        this.uploadingAvatar = false;
        input.value = '';
      }
    });
  }

  confirmRemoveAvatar(event: MouseEvent): void {
    event.stopPropagation();

    const confirmed = window.confirm('¿Quieres eliminar la foto de perfil?');
    if (!confirmed) return;

    this.removeAvatar();
  }

  removeAvatar(): void {
    this.uploadingAvatar = true;

    this.usersService.removeAvatar().subscribe({
      next: (updatedUser) => {
        this.user = updatedUser;
        this.auth.setUser(updatedUser as any);
        this.uploadingAvatar = false;
      },
      error: (err) => {
        console.error('Error eliminando avatar', err);
        this.uploadingAvatar = false;
      }
    });
  }

  scrollToPosts(): void {
    const el = document.getElementById('profile-posts');
    if (el) {
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  }

  getRatingLabel(value: number | string | null | undefined): string {
    const numericValue = Number(value || 0);

    if (!numericValue || Number.isNaN(numericValue)) {
      return 'Sin votos';
    }

    return numericValue.toFixed(1);
  }

  getRatingsCountLabel(count: number | string | null | undefined): string {
    const numericCount = Number(count || 0);

    if (numericCount === 1) {
      return '1 voto';
    }

    return `${numericCount} votos`;
  }
}