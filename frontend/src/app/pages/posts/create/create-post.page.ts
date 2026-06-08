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
    const files = Array.from(event.target.files) as File[];

    this.selectedFiles = files.slice(0, 10);

    this.previews = [];

    this.selectedFiles.forEach(file => {
      const reader = new FileReader();

      reader.onload = () => {
        this.previews.push(reader.result as string);
      };

      reader.readAsDataURL(file);
    });
  }

  removePhoto(index: number): void {
    this.selectedFiles.splice(index, 1);
    this.previews.splice(index, 1);
  }

  save(): void {

    if (!this.form.title.trim()) {
      alert('El título es obligatorio');
      return;
    }

    if (this.selectedFiles.length === 0) {
      alert('Debes subir al menos una foto');
      return;
    }

    const formData = new FormData();

    formData.append('title', this.form.title);
    formData.append('description', this.form.description || '');

    if (this.form.category_id) {
      formData.append('category_id', String(this.form.category_id));
    }

    this.selectedFiles.forEach(file => {
      formData.append('photos', file);
    });

    this.saving = true;

    this.postsService.createPost(formData).subscribe({
      next: () => {
        this.router.navigateByUrl('/profile');
      },
      error: (err) => {
        console.error(err);
        this.saving = false;
        alert('Error al crear el post');
      }
    });

  }

}