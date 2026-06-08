import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AdminService, AdminUserRow } from '../../../core/services/admin.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-users.page.html',
  styleUrl: './admin-users.page.scss',
})
export class AdminUsersPage implements OnInit {
  loading = true;
  users: AdminUserRow[] = [];

  filters = {
    q: '',
    role: '',
    status: '',
  };

  constructor(private adminService: AdminService) {}

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading = true;

    this.adminService.getUsers({
      q: this.filters.q || undefined,
      role: this.filters.role || undefined,
      status: this.filters.status || undefined,
    }).subscribe({
      next: (users) => {
        this.users = users;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error cargando usuarios admin', err);
        this.loading = false;
      }
    });
  }

  applyFilters(): void {
    this.loadUsers();
  }

  clearFilters(): void {
    this.filters = {
      q: '',
      role: '',
      status: '',
    };
    this.loadUsers();
  }

  confirmDeleteUser(user: AdminUserRow): void {
    const confirmed = window.confirm(`¿Quieres borrar al usuario ${user.name} ${user.surname}?`);
    if (!confirmed) return;

    this.adminService.deleteUser(user.id).subscribe({
      next: () => this.loadUsers(),
      error: (err) => console.error('Error borrando usuario', err)
    });
  }

  confirmRestoreUser(user: AdminUserRow): void {
    const confirmed = window.confirm(`¿Quieres restaurar al usuario ${user.name} ${user.surname}?`);
    if (!confirmed) return;

    this.adminService.restoreUser(user.id).subscribe({
      next: () => this.loadUsers(),
      error: (err) => console.error('Error restaurando usuario', err)
    });
  }

  getRoleLabel(user: AdminUserRow): string {
    if (user.admin) return 'Admin';
    if (user.photographer && user.model) return 'Fotógrafo / Modelo';
    if (user.photographer) return 'Fotógrafo';
    if (user.model) return 'Modelo';
    return 'Usuario';
  }

  isDeleted(user: AdminUserRow): boolean {
    return !!user.deleted_at || user.active === 0;
  }
}