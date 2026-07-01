import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Salon } from '../../../core/models/salon.model';
import { SalonService as SalonServiceModel } from '../../../core/models/service.model';
import { Staff } from '../../../core/models/staff.model';
import { AuthService } from '../../../core/services/auth.service';
import { SalonService } from '../../../core/services/salon.service';
import { QueueService } from '../../../core/services/queue.service';
import { ToastService } from '../../../core/services/toast.service';
import { extractErrorMessage } from '../../../core/utils/http-error.util';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { fadeSlide, successPop } from '../../../shared/animations/fade-slide.animation';

type Step = 'phone' | 'otp' | 'services' | 'confirm';

const RESEND_COOLDOWN_SECONDS = 60;
const SUCCESS_DISPLAY_MS = 700;

@Component({
  selector: 'app-join-queue',
  imports: [FormsModule, SkeletonComponent],
  templateUrl: './join-queue.component.html',
  styleUrl: './join-queue.component.scss',
  animations: [fadeSlide, successPop],
})
export class JoinQueueComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly salonService = inject(SalonService);
  private readonly queueService = inject(QueueService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly salon = signal<Salon | null>(null);
  readonly services = signal<SalonServiceModel[]>([]);
  readonly staff = signal<Staff[]>([]);

  readonly step = signal<Step>('phone');
  readonly phoneNumber = signal('');
  readonly otpCode = signal('');
  readonly customerName = signal('');
  readonly devOtpHint = signal<string | null>(null);
  readonly sendingOtp = signal(false);
  readonly verifying = signal(false);
  readonly resendCooldown = signal(0);

  readonly selectedServiceIds = signal<Set<string>>(new Set());
  readonly selectedStaffId = signal<string | undefined>(undefined);
  readonly joining = signal(false);
  readonly joinSuccess = signal(false);

  private cooldownTimer?: ReturnType<typeof setInterval>;

  readonly selectedServices = computed(() =>
    this.services().filter((service) => this.selectedServiceIds().has(service.id)),
  );
  readonly totalPrice = computed(() =>
    this.selectedServices().reduce((sum, service) => sum + service.price, 0),
  );
  readonly totalDuration = computed(() =>
    this.selectedServices().reduce((sum, service) => sum + service.durationMinutes, 0),
  );
  readonly selectedStaffName = computed(
    () => this.staff().find((member) => member.id === this.selectedStaffId())?.name,
  );

  async ngOnInit(): Promise<void> {
    try {
      const salon = await this.salonService.getTheSalon();
      this.salon.set(salon);
      if (salon) {
        const [services, staff] = await Promise.all([
          this.salonService.getServices(salon.id),
          this.salonService.getStaff(salon.id),
        ]);
        this.services.set(services.filter((service) => service.isActive));
        this.staff.set(staff.filter((member) => member.isAvailable));
      }
    } finally {
      this.loading.set(false);
    }

    if (this.authService.isCustomer()) {
      this.step.set('services');
    }
  }

  ngOnDestroy(): void {
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
  }

  async sendOtp(): Promise<void> {
    if (!this.phoneNumber().trim()) {
      this.toast.error('Enter your mobile number first');
      return;
    }

    this.sendingOtp.set(true);
    try {
      const result = await this.authService.sendOtp(this.phoneNumber().trim());
      this.devOtpHint.set(result.devOtp ?? null);
      this.step.set('otp');
      this.startResendCooldown();
      this.toast.success('OTP sent to your phone');
    } catch (error) {
      this.toast.error(extractErrorMessage(error));
    } finally {
      this.sendingOtp.set(false);
    }
  }

  async verifyOtp(): Promise<void> {
    if (!this.otpCode().trim()) {
      this.toast.error('Enter the code we sent you');
      return;
    }

    this.verifying.set(true);
    try {
      await this.authService.verifyOtp(
        this.phoneNumber().trim(),
        this.otpCode().trim(),
        this.customerName().trim() || undefined,
      );
      this.step.set('services');
    } catch (error) {
      this.toast.error(extractErrorMessage(error));
    } finally {
      this.verifying.set(false);
    }
  }

  toggleService(serviceId: string): void {
    this.selectedServiceIds.update((current) => {
      const next = new Set(current);
      if (next.has(serviceId)) {
        next.delete(serviceId);
      } else {
        next.add(serviceId);
      }
      return next;
    });
  }

  selectStaff(staffId: string | undefined): void {
    this.selectedStaffId.set(staffId);
  }

  goToConfirm(): void {
    if (this.selectedServiceIds().size === 0) {
      this.toast.error('Select at least one service to continue');
      return;
    }
    this.step.set('confirm');
  }

  backToServices(): void {
    this.step.set('services');
  }

  async confirmJoin(): Promise<void> {
    const salon = this.salon();
    if (!salon) return;

    this.joining.set(true);
    try {
      const entry = await this.queueService.join({
        salonId: salon.id,
        serviceIds: [...this.selectedServiceIds()],
        staffId: this.selectedStaffId(),
      });
      this.joinSuccess.set(true);
      await new Promise((resolve) => setTimeout(resolve, SUCCESS_DISPLAY_MS));
      await this.router.navigate(['/queue', entry.id]);
    } catch (error) {
      this.toast.error(extractErrorMessage(error));
    } finally {
      this.joining.set(false);
    }
  }

  private startResendCooldown(): void {
    this.resendCooldown.set(RESEND_COOLDOWN_SECONDS);
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
    this.cooldownTimer = setInterval(() => {
      this.resendCooldown.update((value) => {
        if (value <= 1) {
          clearInterval(this.cooldownTimer);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
  }
}
