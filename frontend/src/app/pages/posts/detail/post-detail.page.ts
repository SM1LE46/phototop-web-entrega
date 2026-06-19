import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HostListener } from '@angular/core';

import { PostsService } from '../../../core/services/posts.service';
import { AuthService } from '../../../core/services/auth.service';
import { ReportsService, ReportTargetType } from '../../../core/services/reports.service';
import { PostDatePipe } from '../../../core/pipes/post-date.pipe';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, PostDatePipe],
  templateUrl: './post-detail.page.html',
  styleUrl: './post-detail.page.scss',
})
export class PostDetailPage implements OnInit {
  loading = true;
  deleting = false;

  post: any = null;
  currentPhotoIndex = 0;
  showImageModal = false;

  commentText = '';
  sendingComment = false;

  openCommentMenuId: number | null = null;
  editingCommentId: number | null = null;
  showPostActionsMenu = false;
  editingCommentText = '';
  deletingCommentId: number | null = null;
  savingEditedComment = false;

  selectedRating = 0;
  hoverRating = 0;
  sendingRating = false;

  toastMessage = '';
  toastVisible = false;

  showReportModal = false;
  reportTargetType: ReportTargetType = 'post';
  reportTargetId: number | null = null;
  reportReason = '';
  reportDetails = '';
  sendingReport = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private postsService: PostsService,
    private auth: AuthService,
    private reportsService: ReportsService
  ) { }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));

    if (!Number.isInteger(id)) {
      this.router.navigateByUrl('/profile');
      return;
    }

    this.postsService.getPostById(id).subscribe({
      next: (post) => {
        this.post = post;
        if (this.canRatePost) {
          this.loadMyRating(id);
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error cargando post', err);
        this.loading = false;
      }
    });
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeCommentMenu();
    this.closePostActionsMenu();
  }

  goToLogin(): void {
    this.router.navigate(['/auth/login'], {
      queryParams: {
        returnUrl: this.router.url
      }
    });
  }

  stopEvent(event: Event): void {
    event.stopPropagation();
  }

  togglePostActionsMenu(event?: Event): void {
    event?.stopPropagation();
    this.showPostActionsMenu = !this.showPostActionsMenu;
  }

  closePostActionsMenu(): void {
    this.showPostActionsMenu = false;
  }

  openPostReportModal(): void {
    this.closePostActionsMenu();

    if (!this.auth.user) {
      this.goToLogin();
      return;
    }

    if (!this.post?.id) return;

    this.openReportModal('post', this.post.id);
  }

  openPostDeleteAction(): void {
    this.closePostActionsMenu();
    this.deletePost();
  }

  get isOwner(): boolean {
    return !!this.auth.user && !!this.post && this.auth.user.id === this.post.user_id;
  }

  get currentPhotoUrl(): string | null {
    const photo = this.post?.photos?.[this.currentPhotoIndex];
    if (!photo?.file_path) return null;
    return photo.file_path.startsWith('http')
      ? photo.file_path
      : `http://localhost:3000${photo.file_path}`;
  }

  get isLoggedIn(): boolean {
    return !!this.auth.user;
  }

  get canRatePost(): boolean {
    return !!this.auth.user && !!this.post && this.auth.user.id !== this.post.user_id;
  }

  prevPhoto(): void {
    if (!this.post?.photos?.length) return;
    this.currentPhotoIndex =
      (this.currentPhotoIndex - 1 + this.post.photos.length) % this.post.photos.length;
  }

  nextPhoto(): void {
    if (!this.post?.photos?.length) return;
    this.currentPhotoIndex =
      (this.currentPhotoIndex + 1) % this.post.photos.length;
  }

  goToPhoto(index: number): void {
    this.currentPhotoIndex = index;
  }

  deletePost(): void {
    if (!this.post?.id) return;

    const confirmed = window.confirm('¿Quieres eliminar esta publicación?');
    if (!confirmed) return;

    this.deleting = true;

    this.postsService.deletePost(this.post.id).subscribe({
      next: () => {
        this.router.navigateByUrl('/profile');
      },
      error: (err) => {
        console.error('Error borrando post', err);
        this.deleting = false;
      }
    });
  }

  goToAuthorProfile(): void {
    if (!this.post?.user_id) return;

    const currentUserId = this.auth.user?.id;

    if (currentUserId && currentUserId === this.post.user_id) {
      this.router.navigate(['/profile']);
      return;
    }

    this.router.navigate(['/users', this.post.user_id]);
  }

  messageAuthor(): void {
    if (!this.auth.user) {
      this.goToLogin();
      return;
    }

    if (!this.post?.user_id) return;

    this.router.navigate(['/messages', this.post?.user_id]);
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

  submitComment(): void {
    if (!this.post?.id) return;

    const text = this.commentText.trim();
    if (!text) return;

    this.sendingComment = true;

    this.postsService.addComment(this.post.id, text).subscribe({
      next: (res) => {
        const newComment = res.data;

        if (!this.post.comments) {
          this.post.comments = [];
        }

        this.post.comments.unshift(newComment);

        this.commentText = '';
        this.sendingComment = false;
      },
      error: (err) => {
        console.error('Error creando comentario', err);
        this.sendingComment = false;
      }
    });
  }

  toggleCommentMenu(commentId: number): void {
    this.openCommentMenuId = this.openCommentMenuId === commentId ? null : commentId;
  }

  closeCommentMenu(): void {
    this.openCommentMenuId = null;
  }

  isMyComment(comment: any): boolean {
    return !!this.auth.user && this.auth.user.id === comment.user_id;
  }

  startEditComment(comment: any): void {
    this.editingCommentId = comment.id;
    this.editingCommentText = comment.comment || '';
    this.closeCommentMenu();
  }

  cancelEditComment(): void {
    this.editingCommentId = null;
    this.editingCommentText = '';
  }

  saveEditedComment(comment: any): void {
    const text = this.editingCommentText.trim();
    if (!text) return;

    this.savingEditedComment = true;

    this.postsService.updateComment(comment.id, text).subscribe({
      next: (res) => {
        comment.comment = res.data.comment;
        comment.updated_at = res.data.updated_at;
        this.editingCommentId = null;
        this.editingCommentText = '';
        this.savingEditedComment = false;
      },
      error: (err) => {
        console.error('Error editando comentario', err);
        this.savingEditedComment = false;
      }
    });
  }

  removeComment(comment: any): void {
    const confirmed = window.confirm('¿Quieres borrar este comentario?');
    if (!confirmed) return;

    this.deletingCommentId = comment.id;
    this.closeCommentMenu();

    this.postsService.deleteComment(comment.id).subscribe({
      next: () => {
        this.post.comments = this.post.comments.filter((c: any) => c.id !== comment.id);
        this.deletingCommentId = null;
      },
      error: (err) => {
        console.error('Error borrando comentario', err);
        this.deletingCommentId = null;
      }
    });
  }

  setHoverRating(value: number): void {
    this.hoverRating = value;
  }

  clearHoverRating(): void {
    this.hoverRating = 0;
  }

  selectRating(value: number): void {
    this.selectedRating = value;
  }

  submitRating(): void {
    if (!this.post?.id || !this.canRatePost || !this.selectedRating) return;

    this.sendingRating = true;

    this.postsService.ratePost(this.post.id, this.selectedRating).subscribe({
      next: (res) => {
        this.post.avg_rating = res.data.avg_rating;
        this.post.ratings_count = res.data.ratings_count;
        this.selectedRating = res.data.my_rating;
        this.sendingRating = false;

        this.showToast('Puntuación guardada correctamente');
      },
      error: (err) => {
        console.error('Error puntuando post', err);
        this.sendingRating = false;

        this.showToast('No se ha podido guardar la puntuación');
      }
    });
  }

  loadMyRating(postId: number): void {
    if (!this.auth.user) return;

    this.postsService.getMyRating(postId).subscribe({
      next: (res) => {
        this.selectedRating = Number(res.data?.my_rating || 0);
      },
      error: (err) => {
        console.error('Error cargando mi puntuación', err);
      }
    });
  }

  showToast(message: string): void {
    this.toastMessage = message;
    this.toastVisible = true;

    setTimeout(() => {
      this.toastVisible = false;
    }, 2500);
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

  openImageModal(): void {
    if (!this.currentPhotoUrl) {
      return;
    }

    this.showImageModal = true;
  }

  closeImageModal(): void {
    this.showImageModal = false;
  }
}

