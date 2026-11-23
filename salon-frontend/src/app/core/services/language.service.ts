import { Injectable, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

export type AppLanguage = 'en' | 'hi';

const LANGUAGE_KEY = 'salon_language';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);

  readonly current = signal<AppLanguage>(this.resolveInitialLanguage());

  setLanguage(lang: AppLanguage): void {
    this.transloco.setActiveLang(lang);
    localStorage.setItem(LANGUAGE_KEY, lang);
    this.current.set(lang);
  }

  private resolveInitialLanguage(): AppLanguage {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    return stored === 'hi' ? 'hi' : 'en';
  }
}
