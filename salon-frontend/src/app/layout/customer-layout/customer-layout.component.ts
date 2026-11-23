import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { animate, style, transition, trigger } from '@angular/animations';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageSwitcherComponent } from '../../shared/components/language-switcher/language-switcher.component';

@Component({
  selector: 'app-customer-layout',
  imports: [RouterOutlet, RouterLink, TranslocoPipe, LanguageSwitcherComponent],
  templateUrl: './customer-layout.component.html',
  styleUrl: './customer-layout.component.scss',
  animations: [
    trigger('routeFade', [
      transition('* <=> *', [
        style({ opacity: 0 }),
        animate('220ms ease-out', style({ opacity: 1 })),
      ]),
    ]),
  ],
})
export class CustomerLayoutComponent {
  prepareRoute(outlet: RouterOutlet): string {
    if (!outlet?.isActivated) return '';
    return outlet.activatedRoute.routeConfig?.path ?? '';
  }
}
