import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { FollowUser, UsersService } from '../../core/services/users.service';

type FollowMode = 'followers' | 'following';

@Component({
    standalone: true,
    imports: [CommonModule, RouterLink],
    templateUrl: './follows.page.html',
    styleUrl: './follows.page.scss',
})
export class FollowsPage implements OnInit {
    loading = true;
    mode: FollowMode = 'followers';
    users: FollowUser[] = [];

    targetUserId: number | null = null;
    isOwnProfile = false;

    constructor(
        private route: ActivatedRoute,
        private usersService: UsersService,
        private auth: AuthService
    ) { }

    ngOnInit(): void {
        this.route.url.subscribe(segments => {
            const lastSegment = segments[segments.length - 1]?.path;
            this.mode = lastSegment === 'following' ? 'following' : 'followers';

            const idParam = this.route.snapshot.paramMap.get('id');
            const parsedId = idParam ? Number(idParam) : null;

            if (parsedId && Number.isInteger(parsedId) && parsedId > 0) {
                this.targetUserId = parsedId;
                this.isOwnProfile = this.auth.user?.id === parsedId;
            } else {
                this.targetUserId = this.auth.user?.id ?? null;
                this.isOwnProfile = true;
            }

            this.loadUsers();
        });
    }

    loadUsers(): void {
        if (!this.targetUserId) {
            this.users = [];
            this.loading = false;
            return;
        }

        this.loading = true;

        const request$ = this.mode === 'followers'
            ? this.usersService.getUserFollowers(this.targetUserId)
            : this.usersService.getUserFollowing(this.targetUserId);

        request$.subscribe({
            next: (users) => {
                this.users = users;
                this.loading = false;
            },
            error: (err) => {
                console.error('Error cargando follows', err);
                this.users = [];
                this.loading = false;
            }
        });
    }

    get title(): string {
        return this.mode === 'followers' ? 'Seguidores' : 'Seguidos';
    }

    get subtitle(): string {
        if (this.isOwnProfile) {
            return this.mode === 'followers'
                ? 'Usuarios que siguen tu perfil.'
                : 'Usuarios a los que sigues.';
        }

        return this.mode === 'followers'
            ? 'Usuarios que siguen este perfil.'
            : 'Usuarios a los que sigue este perfil.';
    }

    get backLink(): string {
        if (this.isOwnProfile) {
            return '/profile';
        }

        return this.targetUserId ? `/users/${this.targetUserId}` : '/profile';
    }

    getUserLink(user: FollowUser): string {
        if (this.auth.user?.id === user.id) {
            return '/profile';
        }

        return `/users/${user.id}`;
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