import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  PhotographerRankingRow,
  RankingPeriod,
  RankingsService
} from '../../core/services/rankings.service';

import { ProvincesService } from '../../core/services/provinces.service';
import { CategoriesService } from '../../core/services/categories.service';

import { Province } from '../../models/province.model';
import { Category } from '../../models/category.model';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './rankings.page.html',
  styleUrl: './rankings.page.scss',
})
export class RankingsPage implements OnInit {
  loading = true;

  rankings: PhotographerRankingRow[] = [];
  provinces: Province[] = [];
  categories: Category[] = [];

  rankingPage = 1;
  rankingLimit = 10;
  rankingTotal = 0;
  rankingTotalPages = 1;

  months = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' },
  ];

  years: number[] = [];

  filters = {
    period: 'monthly' as RankingPeriod,
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    province_id: null as number | null,
    category_id: null as number | null,
    min_ratings: 1,
    limit: 10,
  };

  constructor(
    private rankingsService: RankingsService,
    private provincesService: ProvincesService,
    private categoriesService: CategoriesService
  ) { }

  ngOnInit(): void {
    this.buildYears();
    this.loadCatalogs();
    this.loadRanking(1);
  }

  buildYears(): void {
    const currentYear = new Date().getFullYear();

    this.years = [
      currentYear,
      currentYear - 1,
      currentYear - 2,
      currentYear - 3,
    ];
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

  setPeriod(period: RankingPeriod): void {
    this.filters.period = period;
    this.loadRanking(1);
  }

  applyFilters(): void {
    this.loadRanking(1);
  }

  clearFilters(): void {
    this.filters = {
      period: 'monthly',
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      province_id: null,
      category_id: null,
      min_ratings: 1,
      limit: 10,
    };

    this.loadRanking(1);
  }

  loadRanking(page = 1): void {
    this.loading = true;

    this.rankingsService.getPhotographersRanking({
      period: this.filters.period,
      year: this.filters.year,
      month: this.filters.month,
      province_id: this.filters.province_id,
      category_id: this.filters.category_id,
      min_ratings: this.filters.min_ratings,
      page,
      limit: this.rankingLimit,
    }).subscribe({
      next: (data) => {
        this.rankings = data.results;
        this.rankingPage = data.page;
        this.rankingLimit = data.limit;
        this.rankingTotal = data.total;
        this.rankingTotalPages = data.totalPages;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error cargando ranking', err);
        this.rankings = [];
        this.rankingTotal = 0;
        this.rankingTotalPages = 1;
        this.loading = false;
      }
    });
  }

  goToRankingPage(page: number): void {
    if (page < 1 || page > this.rankingTotalPages || page === this.rankingPage) return;

    this.loadRanking(page);

    setTimeout(() => {
      document.querySelector('.ranking-results')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }, 50);
  }

  nextRankingPage(): void {
    this.goToRankingPage(this.rankingPage + 1);
  }

  prevRankingPage(): void {
    this.goToRankingPage(this.rankingPage - 1);
  }

  getPeriodTitle(): string {
    if (this.filters.period === 'monthly') {
      const month = this.months.find(m => m.value === Number(this.filters.month));
      return `Ranking mensual${month ? ' de ' + month.label : ''} ${this.filters.year}`;
    }

    if (this.filters.period === 'yearly') {
      return `Ranking anual ${this.filters.year}`;
    }

    return 'Ranking global';
  }

  getRankingSubtitle(): string {
    const parts: string[] = [];

    const province = this.provinces.find(p => p.id === Number(this.filters.province_id));
    const category = this.categories.find(c => c.id === Number(this.filters.category_id));

    if (province) {
      parts.push(province.name);
    } else {
      parts.push('Todas las provincias');
    }

    if (category) {
      parts.push(category.name);
    } else {
      parts.push('Todas las categorías');
    }

    if (this.rankingTotal > 0) {
      parts.push(`${this.rankingTotal} resultado${this.rankingTotal === 1 ? '' : 's'}`);
    }

    return parts.join(' · ');
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

    return `/${url.replace(/^\/+/, '')}`;
  }

  getInitial(name: string | null | undefined): string {
    if (!name || !name.trim()) return '?';
    return name.trim().charAt(0).toUpperCase();
  }

  getPositionIcon(position: number): string | null {
    if (position === 1) return '/medalla-oro-transparente.png';
    if (position === 2) return '/medalla-plata-transparente.png';
    if (position === 3) return '/medalla-bronce-transparente.png';
    return null;
  }
}