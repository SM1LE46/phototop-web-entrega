import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { CategoriesService } from '../../../core/services/categories.service';
import { PostsService } from '../../../core/services/posts.service';

import { Category } from '../../../models/category.model';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-post.page.html',
  styleUrl: './create-post.page.scss'
})
export class CreatePostPage implements OnInit {

  loading = true;
  saving = false;

  categories: Category[] = [];

  form = {
    title: '',
    description: '',
    category_id: null as number | null
  };

  selectedFiles: File[] = [];
  previews: string[] = [];

  readonly maxPhotos = 10;
  readonly maxPhotoSizeMb = 8;
  readonly maxPhotoSizeBytes = this.maxPhotoSizeMb * 1024 * 1024;
  readonly allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];

  errorMessage = '';

  constructor(
    private categoriesService: CategoriesService,
    private postsService: PostsService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.categoriesService.getCategories().subscribe({
      next: (categories) => {
        this.categories = categories;
        this.loading = false;
      }
    });
  }

  onFilesSelected(event: any): void {
    this.errorMessage = '';

    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []) as File[];

    if (files.length === 0) {
      return;
    }

    if (files.length > this.maxPhotos) {
      this.errorMessage = `Puedes subir como máximo ${this.maxPhotos} fotos.`;
      input.value = '';
      return;
    }

    const invalidTypeFile = files.find(file => !this.allowedImageTypes.includes(file.type));

    if (invalidTypeFile) {
      this.errorMessage = 'Solo puedes subir imágenes en formato JPG, PNG o WEBP.';
      input.value = '';
      return;
    }

    const tooLargeFile = files.find(file => file.size > this.maxPhotoSizeBytes);

    if (tooLargeFile) {
      this.errorMessage = `La imagen "${tooLargeFile.name}" es demasiado grande. Cada foto debe pesar como máximo ${this.maxPhotoSizeMb} MB.`;
      input.value = '';
      return;
    }

    this.selectedFiles = files;
    this.previews = new Array(files.length);

    this.selectedFiles.forEach((file, index) => {
      const reader = new FileReader();

      reader.onload = () => {
        this.previews[index] = reader.result as string;
      };

      reader.readAsDataURL(file);
    });
  }

  removePhoto(index: number, fileInput?: HTMLInputElement): void {
    this.errorMessage = '';

    this.selectedFiles.splice(index, 1);
    this.previews.splice(index, 1);

    if (fileInput) {
      fileInput.value = '';
    }
  }

  setAsCover(index: number): void {
    this.errorMessage = '';

    if (index === 0) {
      return;
    }

    const selectedFile = this.selectedFiles.splice(index, 1)[0];
    const selectedPreview = this.previews.splice(index, 1)[0];

    this.selectedFiles.unshift(selectedFile);
    this.previews.unshift(selectedPreview);
  }

  private translateCreatePostError(message?: string): string {
    switch (message) {
      case 'One of the images is too large. Each photo must be at most 8 MB.':
        return 'Una de las imágenes es demasiado grande. Cada foto debe pesar como máximo 8 MB.';

      case 'Too many photos selected. You can upload at most 10 images.':
        return 'Has seleccionado demasiadas fotos. Puedes subir como máximo 10 imágenes.';

      case 'Only JPG, PNG or WEBP images are allowed':
        return 'Solo puedes subir imágenes en formato JPG, PNG o WEBP.';

      case 'The selected images could not be processed.':
        return 'No se han podido procesar las imágenes seleccionadas.';

      case 'Title is required':
        return 'El título es obligatorio.';

      case 'Category is required':
        return 'La categoría es obligatoria.';

      case 'At least one photo required':
        return 'Debes subir al menos una foto.';

      case 'Invalid category_id':
      case 'Category not found':
        return 'La categoría seleccionada no es válida.';

      case 'Server error':
        return 'Error interno del servidor. Inténtalo de nuevo más tarde.';

      default:
        return 'No se ha podido crear la publicación. Revisa las imágenes y vuelve a intentarlo.';
    }
  }

  save(): void {
    this.errorMessage = '';

    if (!this.form.title.trim()) {
      this.errorMessage = 'El título es obligatorio.';
      return;
    }

    if (!this.form.category_id) {
      this.errorMessage = 'La categoría es obligatoria.';
      return;
    }

    if (this.selectedFiles.length === 0) {
      this.errorMessage = 'Debes subir al menos una foto.';
      return;
    }

    const formData = new FormData();

    formData.append('title', this.form.title);
    formData.append('description', this.form.description || '');
    formData.append('category_id', String(this.form.category_id));

    this.selectedFiles.forEach(file => {
      formData.append('photos', file);
    });

    this.saving = true;

    this.postsService.createPost(formData).subscribe({
      next: () => {
        this.router.navigateByUrl('/profile');
      },
      error: (err) => {
        this.saving = false;
        this.errorMessage = this.translateCreatePostError(err?.error?.message);
      }
    });

  }

}