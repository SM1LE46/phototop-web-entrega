import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { PostsService, PostListItem } from '../../core/services/posts.service';
import { PostDatePipe } from '../../core/pipes/post-date.pipe';

interface CategoryCard {
  id: number;
  name: string;
  slug: string;
  description: string;
  image: string;
}

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, PostDatePipe],
  templateUrl: './categories.page.html',
  styleUrl: './categories.page.scss',
})
export class CategoriesPage implements OnInit {
  loadingPosts = false;
  posts: PostListItem[] = [];
  selectedCategory: CategoryCard | null = null;

  postsPage = 1;
  postsLimit = 8;
  postsTotal = 0;
  postsTotalPages = 1;

  categories: CategoryCard[] = [
    {
      id: 1,
      name: 'Retrato',
      slug: 'retrato',
      description: 'Sesiones personales, books profesionales y fotografía individual.',
      image: '/categories/retrato.jpg',
    },
    {
      id: 2,
      name: 'Moda',
      slug: 'moda',
      description: 'Editoriales, campañas, sesiones de marca y fotografía de producto.',
      image: '/categories/moda.jpg',
    },
    {
      id: 3,
      name: 'Paisaje',
      slug: 'paisaje',
      description: 'Fotografía de exteriores, viajes, localizaciones y espacios abiertos.',
      image: '/categories/paisaje.jpg',
    },
    {
      id: 4,
      name: 'Naturaleza',
      slug: 'naturaleza',
      description: 'Fauna, flora, entornos naturales y fotografía ambiental.',
      image: '/categories/naturaleza.jpg',
    },
    {
      id: 5,
      name: 'Arquitectura',
      slug: 'arquitectura',
      description: 'Espacios interiores, edificios, viviendas y proyectos arquitectónicos.',
      image: '/categories/arquitectura.jpg',
    },
    {
      id: 6,
      name: 'Deporte',
      slug: 'deporte',
      description: 'Eventos deportivos, acción, movimiento y fotografía dinámica.',
      image: '/categories/deporte.jpg',
    },
    {
      id: 7,
      name: 'Boda',
      slug: 'boda',
      description: 'Bodas, preboda, celebraciones y eventos especiales.',
      image: '/categories/boda.jpg',
    },
    {
      id: 8,
      name: 'Otros',
      slug: 'otros',
      description: 'Propuestas creativas y trabajos que no encajan en una categoría concreta.',
      image: '/categories/otros.jpg',
    },
  ];

  constructor(
    private route: ActivatedRoute,
    private postsService: PostsService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const slug = params.get('slug');

      this.postsPage = 1;
      this.postsTotal = 0;
      this.postsTotalPages = 1;

      if (!slug) {
        this.selectedCategory = null;
        this.posts = [];
        this.loadingPosts = false;
        return;
      }

      this.selectedCategory = this.categories.find(category => category.slug === slug) || null;

      if (this.selectedCategory) {
        this.loadCategoryPosts(1);
      } else {
        this.posts = [];
        this.loadingPosts = false;
      }
    });
  }

  loadCategoryPosts(page = 1): void {
    if (!this.selectedCategory?.id) return;

    this.loadingPosts = true;

    this.postsService.getPostsPage(page, this.postsLimit, this.selectedCategory.id).subscribe({
      next: (res) => {
        this.posts = res.posts;
        this.postsPage = res.page;
        this.postsLimit = res.limit;
        this.postsTotal = res.total;
        this.postsTotalPages = res.totalPages;
        this.loadingPosts = false;
      },
      error: (err) => {
        console.error('Error cargando posts de categoría', err);
        this.posts = [];
        this.postsTotal = 0;
        this.postsTotalPages = 1;
        this.loadingPosts = false;
      }
    });
  }

  goToPostsPage(page: number): void {
    if (page < 1 || page > this.postsTotalPages || page === this.postsPage) return;

    this.loadCategoryPosts(page);

    setTimeout(() => {
      document.querySelector('.category-posts-section')?.scrollIntoView({
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

  toNumber(value: number | string | null | undefined): number {
    return Number(value || 0);
  }

  getPostCoverUrl(post: PostListItem): string | null {
    if (!post.cover_photo) return null;

    if (post.cover_photo.startsWith('http://') || post.cover_photo.startsWith('https://')) {
      return post.cover_photo;
    }

    return `/${post.cover_photo.replace(/^\/+/, '')}`;
  }

  hasProfileImage(url: string | null | undefined): boolean {
    return !!url && url.trim() !== '';
  }

  getProfileImage(url: string | null | undefined): string {
    if (!url || url.trim() === '') return '';

    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    return `/${url.replace(/^\/+/, '')}`;
  }

  getInitial(name: string | null | undefined): string {
    if (!name || !name.trim()) return '?';
    return name.trim().charAt(0).toUpperCase();
  }

  getHeroBackground(): string {
    const image = this.selectedCategory?.image || '/categories-hero.jpg';

    return `
      linear-gradient(
        90deg,
        rgba(15, 23, 42, 0.78) 0%,
        rgba(15, 23, 42, 0.54) 42%,
        rgba(15, 23, 42, 0.12) 100%
      ),
      url('${image}')
    `;
  }
}