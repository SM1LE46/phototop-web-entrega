import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'postDate',
  standalone: true,
  pure: false
})
export class PostDatePipe implements PipeTransform {

  transform(value: string | Date | null | undefined): string {
    const date = this.parseDate(value);

    if (!date) {
      return '';
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    if (diffMs < 0) {
      return this.formatFullDate(date, now);
    }

    const minuteMs = 60 * 1000;
    const hourMs = 60 * minuteMs;
    const dayMs = 24 * hourMs;

    const diffMinutes = Math.floor(diffMs / minuteMs);
    const diffHours = Math.floor(diffMs / hourMs);
    const diffDays = Math.floor(diffMs / dayMs);

    if (diffMinutes < 1) {
      return 'Ahora';
    }

    if (diffMinutes < 60) {
      return `hace ${diffMinutes} min`;
    }

    if (diffHours < 24) {
      return `hace ${diffHours} h`;
    }

    if (diffDays < 7) {
      return diffDays === 1 ? 'hace 1 día' : `hace ${diffDays} días`;
    }

    return this.formatFullDate(date, now);
  }

  private parseDate(value: string | Date | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }

    const normalizedValue = value.includes('T')
      ? value
      : value.replace(' ', 'T');

    const date = new Date(normalizedValue);

    return isNaN(date.getTime()) ? null : date;
  }

  private formatFullDate(date: Date, now: Date): string {
    const sameYear = date.getFullYear() === now.getFullYear();

    const options: Intl.DateTimeFormatOptions = sameYear
      ? { day: 'numeric', month: 'long' }
      : { day: 'numeric', month: 'long', year: 'numeric' };

    return new Intl.DateTimeFormat('es-ES', options).format(date);
  }
}