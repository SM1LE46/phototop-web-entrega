import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class LoginPage implements OnInit {
  email = '';
  password = '';
  loading = false;
  error: string | null = null;

  returnUrl = '/profile';

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    this.returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/profile';
  }


  private translateLoginError(message?: string): string {
    switch (message) {
      case 'Missing fields: email, password':
        return 'El correo electrónico y la contraseña son obligatorios.';

      case 'Invalid email':
        return 'El correo electrónico no tiene un formato válido.';

      case 'Invalid credentials':
        return 'El correo electrónico o la contraseña no son correctos.';

      case 'Account disabled':
        return 'Esta cuenta está desactivada.';

      case 'Server error':
        return 'Error interno del servidor. Inténtalo de nuevo más tarde.';

      default:
        return 'No se ha podido iniciar sesión. Revisa los datos e inténtalo de nuevo.';
    }
  }
  
  onSubmit(): void {
    if (this.loading) return;

    this.loading = true;
    this.error = null;

    this.auth.login({
      email: this.email,
      password: this.password,
    }).subscribe({
      next: () => {
        this.auth.me().subscribe({
          next: () => {
            this.loading = false;
            this.router.navigateByUrl(this.returnUrl);
          },
          error: () => {
            this.loading = false;
            this.router.navigateByUrl(this.returnUrl);
          }
        });
      },
      error: (e) => {
        this.loading = false;
        this.error = this.translateLoginError(e?.error?.message);
      },
    });
  }
}