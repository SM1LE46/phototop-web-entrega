import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ProvincesService } from '../../core/services/provinces.service';
import { CategoriesService } from '../../core/services/categories.service';
import { SearchService, PhotographerRow } from '../../core/services/search.service';
import { Province } from '../../models/province.model';
import { Category } from '../../models/category.model';
import { AuthService } from '../../core/services/auth.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './photographers.page.html',
  styleUrls: ['./photographers.page.scss'],
})
export class PhotographersPage implements OnInit {
  loading = true;
  refreshing = false;
  hasLoadedOnce = false;

  photographers: PhotographerRow[] = [];
  provinces: Province[] = [];
  categories: Category[] = [];

  photographersPage = 1;
  photographersLimit = 6;
  photographersTotal = 0;
  photographersTotalPages = 1;

  filters = {
    q: '',
    province_id: null as number | null,
    category_id: null as number | null,
    min_rating: null as number | null,
  };

  constructor(
    private route: ActivatedRoute,
    private searchService: SearchService,
    private provincesService: ProvincesService,
    private categoriesService: CategoriesService,
    private auth: AuthService
  ) { }

  ngOnInit(): void {
    this.loadCatalogs();

    this.route.queryParamMap.subscribe(params => {
      const categoryParam = params.get('category_ids') || params.get('category_id');
      const firstCategory = categoryParam ? categoryParam.split(',')[0] : null;
      const categoryId = firstCategory ? Number(firstCategory) : null;

      this.filters.category_id =
        categoryId !== null && Number.isInteger(categoryId) && categoryId > 0
          ? categoryId
          : null;

      this.loadPhotographers(1);
    });
  }

  loadCatalogs(): void {
    this.provincesService.getProvinces().subscribe({
      next: (provinces) => {
        this.provinces = provinces;
      },
      error: (err) => {
        console.error('Error cargando provincias', err);
      }
    });

    this.categoriesService.getCategories().subscribe({
      next: (categories) => {
        this.categories = categories;
      },
      error: (err) => {
        console.error('Error cargando categorías', err);
      }
    });
  }

  loadPhotographers(page = 1): void {
    if (this.hasLoadedOnce) {
      this.refreshing = true;
    } else {
      this.loading = true;
    }

    const currentUserId = this.auth.user?.id ?? null;

    this.searchService.getPhotographersPage({
      q: this.filters.q || undefined,
      province_id: this.filters.province_id,
      category_ids: this.filters.category_id ? [this.filters.category_id] : [],
      min_rating: this.filters.min_rating,
      exclude_user_id: currentUserId,
      page,
      limit: this.photographersLimit
    }).subscribe({
      next: (res) => {
        this.photographers = res.photographers;
        this.photographersPage = res.page;
        this.photographersLimit = res.limit;
        this.photographersTotal = res.total;
        this.photographersTotalPages = res.totalPages;

        this.loading = false;
        this.refreshing = false;
        this.hasLoadedOnce = true;
      },
      error: (err) => {
        console.error('Error cargando fotógrafos', err);

        this.photographers = [];
        this.photographersTotal = 0;
        this.photographersTotalPages = 1;

        this.loading = false;
        this.refreshing = false;
        this.hasLoadedOnce = true;
      }
    });
  }

  applyFilters(): void {
    this.loadPhotographers(1);
  }

  clearFilters(): void {
    this.filters = {
      q: '',
      province_id: null,
      category_id: null,
      min_rating: null,
    };

    this.loadPhotographers(1);
  }

  goToPhotographersPage(page: number): void {
    if (
      page < 1 ||
      page > this.photographersTotalPages ||
      page === this.photographersPage ||
      this.refreshing
    ) {
      return;
    }

    this.loadPhotographers(page);

    setTimeout(() => {
      document.querySelector('.photographers-grid')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }, 50);
  }

  nextPhotographersPage(): void {
    this.goToPhotographersPage(this.photographersPage + 1);
  }

  prevPhotographersPage(): void {
    this.goToPhotographersPage(this.photographersPage - 1);
  }

  hasProfileImage(url: string | null): boolean {
    return !!url && url.trim() !== '';
  }

  getInitial(name: string | null | undefined): string {
    if (!name || !name.trim()) return '?';
    return name.trim().charAt(0).toUpperCase();
  }

  getProfileImage(url: string | null): string {
    if (!url || url.trim() === '') {
      return '';
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    return `/${url.replace(/^\/+/, '')}`;
  }

  getCategoriesList(categories: string | null): string[] {
    if (!categories) return [];
    return categories.split(',').map(c => c.trim()).filter(Boolean);
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