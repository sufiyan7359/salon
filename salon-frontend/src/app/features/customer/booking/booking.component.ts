import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Salon } from '../../../core/models/salon.model';
import { Booking } from '../../../core/models/booking.model';
import { SalonService as SalonServiceModel } from '../../../core/models/service.model';
import { Staff } from '../../../core/models/staff.model';
import { AuthService } from '../../../core/services/auth.service';
import { SalonService } from '../../../core/services/salon.service';
import { BookingService } from '../../../core/services/booking.service';
import { ToastService } from '../../../core/services/toast.service';
import { extractErrorMessage } from '../../../core/utils/http-error.util';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { fadeIn, fadeSlide } from '../../../shared/animations/fade-slide.animation';

type Step = 'phone' | 'otp' | 'book';

const RESEND_COOLDOWN_SECONDS = 60;

@Component({
  selector: 'app-booking',
  imports: [FormsModule, SkeletonComponent],
  templateUrl: './booking.component.html',
  styleUrl: './booking.component.scss',
  animations: [fadeIn, fadeSlide],
})
export class BookingComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly salonService = inject(SalonService);
  private readonly bookingService = inject(BookingService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly salon = signal<Salon | null>(null);
  readonly services = signal<SalonServiceModel[]>([]);
  readonly staff = signal<Staff[]>([]);
  readonly myBookings = signal<Booking[]>([]);

  readonly step = signal<Step>('phone');
  readonly phoneNumber = signal('');
  readonly otpCode = signal('');
  readonly devOtpHint = signal<string | null>(null);
  readonly sendingOtp = signal(false);
  readonly verifying = signal(false);
  readonly resendCooldown = signal(0);

  readonly selectedServiceId = signal('');
  readonly selectedStaffId = signal<string | undefined>(undefined);
  readonly bookingDate = signal('');
  readonly bookingTime = signal('');
  readonly submitting = signal(false);

  readonly todayIso = new Date().toISOString().split('T')[0];

  private cooldownTimer?: ReturnType<typeof setInterval>;

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

    if (this.auth.isCustomer()) {
      this.step.set('book');
      await this.refreshMyBookings();
    }
  }

  async sendOtp(): Promise<void> {
    if (!this.phoneNumber().trim()) {
      this.toast.error('Enter your mobile number first');
      return;
    }

    this.sendingOtp.set(true);
    try {
      const result = await this.auth.sendOtp(this.phoneNumber().trim());
      this.devOtpHint.set(result.devOtp ?? null);
      this.step.set('otp');
      this.startResendCooldown();
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
      await this.auth.verifyOtp(this.phoneNumber().trim(), this.otpCode().trim());
      this.step.set('book');
      await this.refreshMyBookings();
    } catch (error) {
      this.toast.error(extractErrorMessage(error));
    } finally {
      this.verifying.set(false);
    }
  }

  async submitBooking(): Promise<void> {
    const salon = this.salon();
    if (!salon) return;

    if (!this.selectedServiceId() || !this.bookingDate() || !this.bookingTime()) {
      this.toast.error('Select a service, date and time');
      return;
    }

    this.submitting.set(true);
    try {
      await this.bookingService.create({
        salonId: salon.id,
        serviceId: this.selectedServiceId(),
        staffId: this.selectedStaffId(),
        bookingDate: this.bookingDate(),
        bookingTime: this.bookingTime(),
      });
      this.toast.success("Booking requested! We'll confirm it shortly.");
      this.selectedServiceId.set('');
      this.selectedStaffId.set(undefined);
      this.bookingDate.set('');
      this.bookingTime.set('');
      await this.refreshMyBookings();
    } catch (error) {
      this.toast.error(extractErrorMessage(error));
    } finally {
      this.submitting.set(false);
    }
  }

  async cancelBooking(booking: Booking): Promise<void> {
    if (!confirm('Cancel this booking?')) return;
    try {
      await this.bookingService.updateStatus(booking.id, 'cancelled');
      this.toast.success('Booking cancelled');
      await this.refreshMyBookings();
    } catch (error) {
      this.toast.error(extractErrorMessage(error));
    }
  }

  isCancellable(booking: Booking): boolean {
    return booking.status === 'pending' || booking.status === 'confirmed';
  }

  private async refreshMyBookings(): Promise<void> {
    this.myBookings.set(await this.bookingService.getMine());
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
