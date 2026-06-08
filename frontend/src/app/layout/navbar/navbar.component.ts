import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { CategoriesService } from '../../core/services/categories.service';
import { Category } from '../../models/category.model';

@Component({
  selector: 'app-navbar',
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent implements OnInit {
  userMenuOpen = false;
  mobileMenuOpen = false;
  mobileCategoriesOpen = false;
  categories: Category[] = [];

  constructor(
    public auth: AuthService,
    private router: Router,
    private categoriesService: CategoriesService
  ) {}

  ngOnInit(): void {
    this.loadCategories();

    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.userMenuOpen = false;
        this.mobileMenuOpen = false;
        this.mobileCategoriesOpen = false;
      });
  }

  private loadCategories(): void {
    this.categoriesService.getCategories().subscribe({
      next: (categories) => {
        this.categories = categories;
      },
      error: (err) => {
        console.error('Error cargando categorías', err);
      }
    });
  }

  goToAllCategories(): void {
    this.mobileMenuOpen = false;
    this.mobileCategoriesOpen = false;
    this.router.navigateByUrl('/categories');
  }

  goToCategory(slug: string): void {
    this.mobileMenuOpen = false;
    this.mobileCategoriesOpen = false;
    this.router.navigate(['/categories', slug]);
  }

  isCategoriesSectionActive(): boolean {
    return this.router.url === '/categories' || this.router.url.startsWith('/categories/');
  }

  isAllCategoriesSelected(): boolean {
    return this.router.url === '/categories';
  }

  isCategorySelected(slug: string): boolean {
    return this.router.url === `/categories/${slug}`;
  }

  isRouteActive(path: string): boolean {
    if (path === '/') {
      return this.router.url === '/';
    }
    return this.router.url === path || this.router.url.startsWith(path + '/');
  }

  toggleUserMenu(): void {
    this.userMenuOpen = !this.userMenuOpen;
  }

  closeUserMenu(): void {
    this.userMenuOpen = false;
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;

    if (!this.mobileMenuOpen) {
      this.mobileCategoriesOpen = false;
    }
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
    this.mobileCategoriesOpen = false;
  }

  toggleMobileCategories(): void {
    this.mobileCategoriesOpen = !this.mobileCategoriesOpen;
  }

  logout(): void {
    this.auth.logout();
    this.userMenuOpen = false;
    this.mobileMenuOpen = false;
    this.mobileCategoriesOpen = false;
    this.router.navigateByUrl('/');
  }

  get navbarProfileImageUrl(): string | null {
    if (!this.auth.user?.profile_image) return null;

    if (this.auth.user.profile_image.startsWith('http')) {
      return this.auth.user.profile_image;
    }

    return `http://localhost:3000${this.auth.user.profile_image}`;
  }

  @HostListener('window:resize')
  onResize(): void {
    if (window.innerWidth > 991) {
      this.mobileMenuOpen = false;
      this.mobileCategoriesOpen = false;
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    if (!target.closest('.user-menu')) {
      this.userMenuOpen = false;
    }

    if (!target.closest('.mobile-menu-wrapper')) {
      this.mobileMenuOpen = false;
      this.mobileCategoriesOpen = false;
    }
  }
}