import { Routes } from '@angular/router';
import { CustomerLayoutComponent } from './layout/customer-layout/customer-layout.component';
import { OwnerLayoutComponent } from './layout/owner-layout/owner-layout.component';
import { ownerGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    component: CustomerLayoutComponent,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/customer/landing/landing.component').then(
            (m) => m.LandingComponent,
          ),
      },
      {
        path: 'join',
        loadComponent: () =>
          import('./features/customer/join-queue/join-queue.component').then(
            (m) => m.JoinQueueComponent,
          ),
      },
      {
        path: 'queue/:entryId',
        loadComponent: () =>
          import(
            './features/customer/live-tracking/live-tracking.component'
          ).then((m) => m.LiveTrackingComponent),
      },
    ],
  },
  {
    path: 'owner/login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then(
        (m) => m.LoginComponent,
      ),
  },
  {
    path: 'owner',
    component: OwnerLayoutComponent,
    canActivate: [ownerGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import(
            './features/owner/live-queue-manager/live-queue-manager.component'
          ).then((m) => m.LiveQueueManagerComponent),
      },
      {
        path: 'services',
        loadComponent: () =>
          import(
            './features/owner/services-manager/services-manager.component'
          ).then((m) => m.ServicesManagerComponent),
      },
      {
        path: 'staff',
        loadComponent: () =>
          import(
            './features/owner/staff-manager/staff-manager.component'
          ).then((m) => m.StaffManagerComponent),
      },
    ],
  },
];
