import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const user = auth.user;

  if (!user) {
    router.navigateByUrl('/auth/login');
    return false;
  }

  if (!user.admin) {
    router.navigateByUrl('/');
    return false;
  }

  return true;
};