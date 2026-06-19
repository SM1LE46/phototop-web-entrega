import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { ProvincesService } from '../../core/services/provinces.service';
import { CategoriesService } from '../../core/services/categories.service';

import { Province } from '../../models/province.model';
import { Category } from '../../models/category.model';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.page.html',
  styleUrl: './register.page.scss',
})
export class RegisterPage implements OnInit {
  step = 1;

  name = '';
  surname = '';
  email = '';
  password = '';
  confirmPassword = '';

  province_id: number | null = null;
  description = '';
  photographer = false;
  model = false;

  provinces: Province[] = [];
  categories: Category[] = [];
  selectedCategoryIds: number[] = [];

  loading = false;
  loadingProvinces = true;
  loadingCategories = true;
  error: string | null = null;

  constructor(
    private auth: AuthService,
    private router: Router,
    private provincesService: ProvincesService,
    private categoriesService: CategoriesService
  ) { }

  ngOnInit(): void {
    this.loadProvinces();
    this.loadCategories();
  }

  loadProvinces(): void {
    this.provincesService.getProvinces().subscribe({
      next: (provinces) => {
        this.provinces = provinces;
        this.loadingProvinces = false;
      },
      error: (err) => {
        console.error('Error cargando provincias', err);
        this.loadingProvinces = false;
      }
    });
  }

  loadCategories(): void {
    this.categoriesService.getCategories().subscribe({
      next: (categories) => {
        this.categories = categories;
        this.loadingCategories = false;
      },
      error: (err) => {
        console.error('Error cargando categorías', err);
        this.loadingCategories = false;
      }
    });
  }

  passwordsMatch(): boolean {
    return this.password === this.confirmPassword;
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
    if (!this.photographer) {
      this.selectedCategoryIds = [];
      if (this.step === 2) {
        this.step = 1;
      }
    }
  }

  goNext(): void {
    this.error = null;

    if (!this.name.trim()) {
      this.error = 'El nombre es obligatorio.';
      return;
    }

    if (!this.surname.trim()) {
      this.error = 'Los apellidos son obligatorios.';
      return;
    }

    if (!this.email.trim()) {
      this.error = 'El correo electrónico es obligatorio.';
      return;
    }

    if (!this.province_id) {
      this.error = 'La provincia es obligatoria.';
      return;
    }

    if (this.password.length < 6) {
      this.error = 'La contraseña debe tener al menos 6 caracteres.';
      return;
    }

    if (!this.passwordsMatch()) {
      this.error = 'Las contraseñas no coinciden.';
      return;
    }

    if (!this.photographer) {
      this.submitRegister();
      return;
    }

    this.step = 2;
  }

  goBack(): void {
    this.error = null;
    this.step = 1;
  }

  submitRegister(): void {
    this.loading = true;
    this.error = null;

    this.auth.register({
      name: this.name.trim(),
      surname: this.surname.trim(),
      email: this.email.trim(),
      password: this.password,
      province_id: this.province_id,
      description: this.description.trim() || null,
      photographer: this.photographer,
      model: this.model,
      category_ids: this.photographer ? this.selectedCategoryIds : [],
    }).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigateByUrl('/');
      },
      error: (e) => {
        this.loading = false;
        this.error = this.translateRegisterError(e?.error?.message);
      },
    });
  }

  private translateRegisterError(message?: string): string {
    switch (message) {
      case 'Name is required':
        return 'El nombre es obligatorio.';

      case 'Surname is required':
        return 'Los apellidos son obligatorios.';

      case 'Email is required':
        return 'El correo electrónico es obligatorio.';

      case 'Province is required':
        return 'La provincia es obligatoria.';

      case 'Password is required':
        return 'La contraseña es obligatoria.';

      case 'Invalid email':
        return 'El correo electrónico no tiene un formato válido.';

      case 'Password must be at least 6 characters':
        return 'La contraseña debe tener al menos 6 caracteres.';

      case 'Email already in use':
        return 'El correo electrónico ya está en uso.';

      case 'Invalid province_id':
        return 'La provincia seleccionada no es válida.';

      case 'Province not found':
        return 'La provincia seleccionada no existe o no está disponible.';

      case 'category_ids must be an array':
      case 'category_ids must contain only integers':
      case 'Some categories do not exist or are inactive':
        return 'Alguna de las categorías seleccionadas no es válida.';

      case 'Only photographers can select categories':
        return 'Solo los fotógrafos pueden seleccionar categorías.';

      case 'Server error':
        return 'Error interno del servidor. Inténtalo de nuevo más tarde.';

      default:
        return 'No se ha podido crear la cuenta. Revisa los datos e inténtalo de nuevo.';
    }
  }

  finishRegister(): void {
    if (this.photographer && this.selectedCategoryIds.length === 0) {
      this.error = 'Selecciona al menos una categoría si eres fotógrafo.';
      return;
    }

    this.submitRegister();
  }
}