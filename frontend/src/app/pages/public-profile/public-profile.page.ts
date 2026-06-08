import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { UsersService } from '../../core/services/users.service';
import { PostsService } from '../../core/services/posts.service';
import { AuthService } from '../../core/services/auth.service';
import { ReportsService, ReportTargetType } from '../../core/services/reports.service';
import { FormsModule } from '@angular/forms';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './public-profile.page.html',
  styleUrls: ['./public-profile.page.scss'],
})
export class PublicProfilePage implements OnInit {
  userId!: number;
  loading = true;
  loadingPosts = false;

  user: any = null;
  posts: any[] = [];

  postsPage = 1;
  postsLimit = 6;
  postsTotal = 0;
  postsTotalPages = 1;

  isFollowing = false;
  followLoading = false;

  showProfileActionsMenu = false;

  showReportModal = false;
  reportTargetType: ReportTargetType = 'user';
  reportTargetId: number | null = null;
  reportReason = '';
  reportDetails = '';
  sendingReport = false;

  toastMessage = '';
  toastVisible = false;

  constructor(
    private route: ActivatedRoute,
    private usersService: UsersService,
    private postsService: PostsService,
    private reportsService: ReportsService,
    private router: Router,
    public auth: AuthService
  ) { }

  ngOnInit(): void {
    this.userId = Number(this.route.snapshot.paramMap.get('id'));
    this.loadUser();
  }

  loadUser(): void {
    if (!this.userId || Number.isNaN(this.userId)) {
      this.loading = false;
      return;
    }

    this.loading = true;

    this.usersService.getPublicUser(this.userId).subscribe({
      next: (user) => {
        this.user = user;
        this.loadFollowStatus();
        this.loadUserPosts(1);
      },
      error: (err) => {
        console.error('Error cargando perfil público', err);
        this.user = null;
        this.posts = [];
        this.postsTotal = 0;
        this.postsTotalPages = 1;
        this.loading = false;
      }
    });
  }

  loadUserPosts(page = 1): void {
    if (!this.userId || Number.isNaN(this.userId)) {
      this.posts = [];
      this.loadingPosts = false;
      this.loading = false;
      return;
    }

    this.loadingPosts = true;

    this.postsService.getUserPostsPage(this.userId, page, this.postsLimit).subscribe({
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
        console.error('Error cargando posts del perfil público', err);
        this.posts = [];
        this.postsTotal = 0;
        this.postsTotalPages = 1;

        this.loadingPosts = false;
        this.loading = false;
      }
    });
  }

  goToPostsPage(page: number): void {
    if (
      page < 1 ||
      page > this.postsTotalPages ||
      page === this.postsPage ||
      this.loadingPosts
    ) {
      return;
    }

    this.loadUserPosts(page);

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

  loadFollowStatus(): void {
    if (!this.auth.user || !this.user?.id) {
      this.isFollowing = false;
      return;
    }

    this.usersService.getFollowStatus(this.user.id).subscribe({
      next: (data) => {
        this.isFollowing = data.is_following;
      },
      error: (err) => {
        console.error('Error cargando estado de seguimiento', err);
        this.isFollowing = false;
      }
    });
  }

  toggleFollow(): void {
    if (!this.auth.user) {
      this.goToLogin();
      return;
    }

    if (!this.user?.id || this.followLoading) return;

    this.followLoading = true;

    const request$ = this.isFollowing
      ? this.usersService.unfollowUser(this.user.id)
      : this.usersService.followUser(this.user.id);

    request$.subscribe({
      next: (data) => {
        const wasFollowing = this.isFollowing;

        this.isFollowing = data.is_following;

        if (this.user && wasFollowing !== this.isFollowing) {
          const currentFollowers = Number(this.user.followers_count || 0);

          this.user.followers_count = this.isFollowing
            ? currentFollowers + 1
            : Math.max(0, currentFollowers - 1);
        }

        this.followLoading = false;
      },
      error: (err) => {
        console.error('Error cambiando seguimiento', err);
        this.followLoading = false;
      }
    });
  }

  toggleProfileActionsMenu(event: Event): void {
    event.stopPropagation();
    this.showProfileActionsMenu = !this.showProfileActionsMenu;
  }

  closeProfileActionsMenu(): void {
    this.showProfileActionsMenu = false;
  }

  openProfileReportModal(event: Event): void {
    event.stopPropagation();

    if (!this.auth.user) {
      this.closeProfileActionsMenu();
      this.goToLogin();
      return;
    }

    if (!this.user?.id) return;

    this.closeProfileActionsMenu();
    this.openReportModal('user', this.user.id);
  }

  goToLogin(): void {
    this.router.navigate(['/auth/login'], {
      queryParams: {
        returnUrl: this.router.url
      }
    });
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeProfileActionsMenu();
  }

  hasProfileImage(url: string | null): boolean {
    return !!url && url.trim() !== '';
  }

  getProfileImage(url: string | null): string {
    if (!url || url.trim() === '') {
      return '';
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    return `http://localhost:3000/${url.replace(/^\/+/, '')}`;
  }

  getInitial(name: string | null | undefined): string {
    if (!name || !name.trim()) return '?';
    return name.trim().charAt(0).toUpperCase();
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

  getPostCoverUrl(post: any): string | null {
    if (!post?.cover_photo) return null;

    if (post.cover_photo.startsWith('http')) {
      return post.cover_photo;
    }

    return `http://localhost:3000${post.cover_photo}`;
  }

  openReportModal(targetType: ReportTargetType, targetId: number): void {
    if (!this.auth.user) {
      this.goToLogin();
      return;
    }

    this.reportTargetType = targetType;
    this.reportTargetId = targetId;
    this.reportReason = '';
    this.reportDetails = '';
    this.showReportModal = true;
  }

  closeReportModal(): void {
    this.showReportModal = false;
    this.reportReason = '';
    this.reportDetails = '';
    this.sendingReport = false;
    this.reportTargetId = null;
  }

  showToast(message: string): void {
    this.toastMessage = message;
    this.toastVisible = true;

    setTimeout(() => {
      this.toastVisible = false;
    }, 2500);
  }

  submitReport(): void {
    if (!this.auth.user) {
      this.closeReportModal();
      this.goToLogin();
      return;
    }

    if (!this.reportTargetId || !this.reportReason.trim() || !this.reportDetails.trim()) return;

    this.sendingReport = true;

    this.reportsService.createReport({
      target_type: this.reportTargetType,
      target_id: this.reportTargetId,
      reason: this.reportReason.trim(),
      details: this.reportDetails.trim()
    }).subscribe({
      next: () => {
        this.closeReportModal();
        this.showToast?.('Reporte enviado correctamente');
      },
      error: (err) => {
        console.error('Error enviando reporte', err);
        this.sendingReport = false;
      }
    });
  }

  openChat(): void {
    if (!this.auth.user) {
      this.goToLogin();
      return;
    }

    this.router.navigate(['/messages', this.userId]);
  }

  getPostRatingLabel(value: number | string | null | undefined): string {
    const numericValue = Number(value || 0);

    if (!numericValue || Number.isNaN(numericValue)) {
      return 'Sin votos';
    }

    return numericValue.toFixed(1);
  }

  getPostRatingsCountLabel(count: number | string | null | undefined): string {
    const numericCount = Number(count || 0);

    if (numericCount === 1) {
      return '1 voto';
    }

    return `${numericCount} votos`;
  }
}