import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/home.page').then(m => m.HomePage),
  },
  {
    path: 'categories',
    loadComponent: () =>
      import('./pages/categories/categories.page').then(m => m.CategoriesPage),
  },
  {
    path: 'categories/:slug',
    loadComponent: () =>
      import('./pages/categories/categories.page').then(m => m.CategoriesPage),
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./pages/profile/profile.page').then(m => m.ProfilePage),
  },
  {
    path: 'profile/edit',
    loadComponent: () =>
      import('./pages/profile/edit/edit-profile.page').then(m => m.EditProfilePage),
  },
  {
    path: 'posts/create',
    loadComponent: () =>
      import('./pages/posts/create/create-post.page').then(m => m.CreatePostPage),
  },
  {
    path: 'posts/:id',
    loadComponent: () =>
      import('./pages/posts/detail/post-detail.page').then(m => m.PostDetailPage),
  },
  {
    path: 'photographers',
    loadComponent: () =>
      import('./pages/photographers/photographers.page').then(m => m.PhotographersPage),
  },
  {
    path: 'profile/followers',
    loadComponent: () =>
      import('./pages/follows/follows.page').then(m => m.FollowsPage),
  },
  {
    path: 'profile/following',
    loadComponent: () =>
      import('./pages/follows/follows.page').then(m => m.FollowsPage),
  },
  {
    path: 'users/:id/followers',
    loadComponent: () =>
      import('./pages/follows/follows.page').then(m => m.FollowsPage),
  },
  {
    path: 'users/:id/following',
    loadComponent: () =>
      import('./pages/follows/follows.page').then(m => m.FollowsPage),
  },
  {
    path: 'users/:id',
    loadComponent: () =>
      import('./pages/public-profile/public-profile.page').then(m => m.PublicProfilePage),
  },
  {
    path: 'messages',
    loadComponent: () =>
      import('./pages/messages/conversations/conversations.page').then(m => m.ConversationsPage),
  },
  {
    path: 'messages/:userId',
    loadComponent: () =>
      import('./pages/messages/chat/chat.page').then(m => m.ChatPage),
  },
  {
    path: 'rankings',
    loadComponent: () =>
      import('./pages/rankings/rankings.page').then(m => m.RankingsPage),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/admin/admin-layout.page').then(m => m.AdminLayoutPage),
        children: [
          {
            path: '',
            pathMatch: 'full',
            redirectTo: 'users',
          },
          {
            path: 'users',
            loadComponent: () =>
              import('./pages/admin/users/admin-users.page').then(m => m.AdminUsersPage),
          },
          {
            path: 'reports',
            loadComponent: () =>
              import('./pages/admin/reports/admin-reports.page').then(m => m.AdminReportsPage),
          },
        ],
      },
    ],
  },
  {
    path: 'auth',
    children: [
      {
        path: 'login',
        loadComponent: () =>
          import('./pages/auth/login.page').then(m => m.LoginPage),
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./pages/auth/register.page').then(m => m.RegisterPage),
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'login',
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];