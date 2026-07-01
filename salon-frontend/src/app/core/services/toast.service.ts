import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  text: string;
  type: ToastType;
}

const DEFAULT_DURATION_MS = 3500;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private idCounter = 0;
  readonly toasts = signal<ToastMessage[]>([]);

  show(text: string, type: ToastType = 'info', duration = DEFAULT_DURATION_MS): void {
    const id = ++this.idCounter;
    this.toasts.update((list) => [...list, { id, text, type }]);
    setTimeout(() => this.dismiss(id), duration);
  }

  success(text: string): void {
    this.show(text, 'success');
  }

  error(text: string): void {
    this.show(text, 'error');
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((toast) => toast.id !== id));
  }
}
