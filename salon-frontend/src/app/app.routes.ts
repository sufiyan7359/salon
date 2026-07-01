import { Routes } from '@angular/router';
import { CustomerLayoutComponent } from './layout/customer-layout/customer-layout.component';

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
];
