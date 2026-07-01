import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { animate, style, transition, trigger } from '@angular/animations';
import { AuthService } from '../../core/services/auth.service';
import { SalonService, SalonPayload } from '../../core/services/salon.service';
import { ToastService } from '../../core/services/toast.service';
import { extractErrorMessage } from '../../core/utils/http-error.util';

@Component({
  selector: 'app-owner-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  templateUrl: './owner-layout.component.html',
  styleUrl: './owner-layout.component.scss',
  animations: [
    trigger('routeFade', [
      transition('* <=> *', [
        style({ opacity: 0 }),
        animate('220ms ease-out', style({ opacity: 1 })),
      ]),
    ]),
  ],
})
export class OwnerLayoutComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly auth = inject(AuthService);
  protected readonly salonService = inject(SalonService);

  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly savingSetup = signal(false);

  readonly setupName = signal('');
  readonly setupAddress = signal('');
  readonly setupCity = signal('');
  readonly setupOpeningTime = signal('09:00');
  readonly setupClosingTime = signal('20:00');

  async ngOnInit(): Promise<void> {
    await this.loadSalon();
  }

  async loadSalon(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      await this.salonService.loadSalon();
    } catch (error) {
      this.loadError.set(true);
      this.toast.error(extractErrorMessage(error, 'Failed to load your salon'));
    } finally {
      this.loading.set(false);
    }
  }

  async submitSetup(): Promise<void> {
    if (!this.setupName().trim() || !this.setupAddress().trim()) {
      this.toast.error('Salon name and address are required');
      return;
    }

    this.savingSetup.set(true);
    try {
      const payload: SalonPayload = {
        name: this.setupName().trim(),
        address: this.setupAddress().trim(),
        city: this.setupCity().trim() || undefined,
        openingTime: this.setupOpeningTime() || undefined,
        closingTime: this.setupClosingTime() || undefined,
      };
      await this.salonService.createSalon(payload);
      this.toast.success('Salon set up! Welcome to your dashboard.');
    } catch (error) {
      this.toast.error(extractErrorMessage(error));
    } finally {
      this.savingSetup.set(false);
    }
  }

  async logout(): Promise<void> {
    this.auth.logout();
    await this.router.navigate(['/owner/login']);
  }

  prepareRoute(outlet: RouterOutlet): string {
    if (!outlet?.isActivated) return '';
    return outlet.activatedRoute.routeConfig?.path ?? '';
  }
}
