import { Component, inject } from '@angular/core';
import { LanguageService, AppLanguage } from '../../../core/services/language.service';

@Component({
  selector: 'app-language-switcher',
  templateUrl: './language-switcher.component.html',
  styleUrl: './language-switcher.component.scss',
})
export class LanguageSwitcherComponent {
  readonly languageService = inject(LanguageService);

  select(lang: AppLanguage): void {
    this.languageService.setLanguage(lang);
  }
}
