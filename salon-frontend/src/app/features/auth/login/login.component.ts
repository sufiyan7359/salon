import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { extractErrorMessage } from '../../../core/utils/http-error.util';
import { fadeIn } from '../../../shared/animations/fade-slide.animation';
import { LanguageSwitcherComponent } from '../../../shared/components/language-switcher/language-switcher.component';

type Mode = 'login' | 'register';

@Component({
  selector: 'app-login',
  imports: [FormsModule, TranslocoPipe, LanguageSwitcherComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  animations: [fadeIn],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly mode = signal<Mode>('login');
  readonly name = signal('');
  readonly email = signal('');
  readonly password = signal('');
  readonly submitting = signal(false);

  toggleMode(): void {
    this.mode.update((m) => (m === 'login' ? 'register' : 'login'));
  }

  async submit(): Promise<void> {
    this.submitting.set(true);
    try {
      if (this.mode() === 'login') {
        await this.auth.ownerLogin(this.email().trim(), this.password());
      } else {
        await this.auth.ownerRegister(
          this.name().trim(),
          this.email().trim(),
          this.password(),
        );
      }
      await this.router.navigate(['/owner']);
    } catch (error) {
      this.toast.error(extractErrorMessage(error));
    } finally {
      this.submitting.set(false);
    }
  }
}
