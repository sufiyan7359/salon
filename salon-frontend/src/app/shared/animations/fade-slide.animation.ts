import { animate, style, transition, trigger } from '@angular/animations';

export const fadeSlide = trigger('fadeSlide', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateX(24px)' }),
    animate(
      '320ms cubic-bezier(0.4, 0, 0.2, 1)',
      style({ opacity: 1, transform: 'translateX(0)' }),
    ),
  ]),
  transition(':leave', [
    animate(
      '200ms cubic-bezier(0.4, 0, 0.2, 1)',
      style({ opacity: 0, transform: 'translateX(-24px)' }),
    ),
  ]),
]);

export const fadeIn = trigger('fadeIn', [
  transition(':enter', [
    style({ opacity: 0 }),
    animate('280ms ease-out', style({ opacity: 1 })),
  ]),
]);

export const numberBump = trigger('numberBump', [
  transition('* => *', [
    style({ transform: 'scale(1.3)' }),
    animate('320ms cubic-bezier(0.34, 1.56, 0.64, 1)', style({ transform: 'scale(1)' })),
  ]),
]);
