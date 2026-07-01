import { Component, inject } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.scss',
  animations: [
    trigger('toastAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(16px) scale(0.95)' }),
        animate(
          '250ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          style({ opacity: 1, transform: 'translateY(0) scale(1)' }),
        ),
      ]),
      transition(':leave', [
        animate(
          '180ms ease-in',
          style({ opacity: 0, transform: 'translateY(8px) scale(0.97)' }),
        ),
      ]),
    ]),
  ],
})
export class ToastComponent {
  protected readonly toastService = inject(ToastService);
}
