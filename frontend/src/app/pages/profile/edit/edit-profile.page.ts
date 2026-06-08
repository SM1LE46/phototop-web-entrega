import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { ProvincesService } from '../../../core/services/provinces.service';
import { Province } from '../../../models/province.model';
import { UsersService } from '../../../core/services/users.service';
import { CategoriesService } from '../../../core/services/categories.service';
import { Category } from '../../../models/category.model';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './edit-profile.page.html',
  styleUrl: './edit-profile.page.scss',
})
export class EditProfilePage implements OnInit {
  loading = true;
  saving = false;

  provinces: Province[] = [];
  allCategories: Category[] = [];
  selectedCategoryIds: number[] = [];

  form = {
    name: '',
    surname: '',
    description: '',
    province_id: null as number | null,
    photographer: false,
    model: false
  };

  constructor(
    private auth: AuthService,
    private router: Router,
    private provincesService: ProvincesService,
    private usersService: UsersService,
    private categoriesService: CategoriesService
  ) {}

  ngOnInit(): void {
    const user = this.auth.user;

    if (!user) {
      this.router.navigateByUrl('/auth/login');
      return;
    }

    this.form.name = user.name || '';
    this.form.surname = user.surname || '';
    this.form.description = user.description || '';
    this.form.province_id = user.province_id || null;
    this.form.photographer = !!user.photographer;
    this.form.model = !!user.model;

    this.loadProvinces();
    this.loadAllCategories();

    if (user.photographer && user.id) {
      this.loadUserCategories(user.id);
    }
  }

  loadProvinces(): void {
    this.provincesService.getProvinces().subscribe({
      next: (provinces) => {
        this.provinces = provinces;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error cargando provincias', err);
        this.loading = false;
      }
    });
  }

  loadAllCategories(): void {
    this.categoriesService.getCategories().subscribe({
      next: (categories) => {
        this.allCategories = categories;
      },
      error: (err) => {
        console.error('Error cargando categorías', err);
        this.allCategories = [];
      }
    });
  }

  loadUserCategories(userId: number): void {
    this.categoriesService.getUserCategories(userId).subscribe({
      next: (categories) => {
        this.selectedCategoryIds = categories.map(category => category.id);
      },
      error: (err) => {
        console.error('Error cargando categorías del usuario', err);
        this.selectedCategoryIds = [];
      }
    });
  }

  isCategorySelected(categoryId: number): boolean {
    return this.selectedCategoryIds.includes(categoryId);
  }

  toggleCategory(categoryId: number): void {
    if (this.isCategorySelected(categoryId)) {
      this.selectedCategoryIds = this.selectedCategoryIds.filter(id => id !== categoryId);
      return;
    }

    this.selectedCategoryIds = [...this.selectedCategoryIds, categoryId];
  }

  onPhotographerChange(): void {
    if (!this.form.photographer) {
      this.selectedCategoryIds = [];
    }
  }

  save(): void {
    this.saving = true;

    this.usersService.updateMe({
      name: this.form.name.trim(),
      surname: this.form.surname.trim(),
      description: this.form.description?.trim() || null,
      province_id: this.form.province_id,
      photographer: this.form.photographer,
      model: this.form.model
    }).subscribe({
      next: (updatedUser) => {

        const finishSuccess = (finalUser: any) => {
          this.auth.setUser(finalUser);
          this.saving = false;
          this.router.navigateByUrl('/profile');
        };

        if (this.form.photographer) {
          this.usersService.updateMyCategories(this.selectedCategoryIds).subscribe({
            next: () => {
              finishSuccess(updatedUser);
            },
            error: (err) => {
              console.error('Error actualizando categorías', err);
              this.saving = false;
            }
          });
        } else {
          finishSuccess(updatedUser);
        }
      },

      error: (err) => {
        console.error('Error actualizando perfil', err);
        this.saving = false;
      }
    });
  }
}