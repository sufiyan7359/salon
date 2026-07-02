import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TranslocoPipe, translate } from '@jsverse/transloco';
import { Booking } from '../../../core/models/booking.model';
import { SalonService } from '../../../core/services/salon.service';
import { BookingService } from '../../../core/services/booking.service';
import { ToastService } from '../../../core/services/toast.service';
import { extractErrorMessage } from '../../../core/utils/http-error.util';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { fadeIn } from '../../../shared/animations/fade-slide.animation';

@Component({
  selector: 'app-bookings-manager',
  imports: [SkeletonComponent, TranslocoPipe],
  templateUrl: './bookings-manager.component.html',
  styleUrl: './bookings-manager.component.scss',
  animations: [fadeIn],
})
export class BookingsManagerComponent implements OnInit {
  private readonly salonService = inject(SalonService);
  private readonly bookingService = inject(BookingService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly bookings = signal<Booking[]>([]);
  readonly actioningId = signal<string | null>(null);

  readonly upcoming = computed(() =>
    this.bookings().filter(
      (booking) => booking.status === 'pending' || booking.status === 'confirmed',
    ),
  );
  readonly past = computed(() =>
    this.bookings().filter(
      (booking) => booking.status === 'completed' || booking.status === 'cancelled',
    ),
  );

  private salonId = '';

  async ngOnInit(): Promise<void> {
    const salon = this.salonService.salon();
    if (!salon) return;
    this.salonId = salon.id;
    await this.refresh();
  }

  confirm(booking: Booking): Promise<void> {
    return this.setStatus(booking, 'confirmed');
  }

  complete(booking: Booking): Promise<void> {
    return this.setStatus(booking, 'completed');
  }

  async cancel(booking: Booking): Promise<void> {
    if (!confirm(translate('booking.confirmCancel'))) return;
    await this.setStatus(booking, 'cancelled');
  }

  private async setStatus(
    booking: Booking,
    status: 'confirmed' | 'completed' | 'cancelled',
  ): Promise<void> {
    this.actioningId.set(booking.id);
    try {
      await this.bookingService.updateStatus(booking.id, status);
      this.toast.success(translate('ownerBookings.toastUpdated'));
      await this.refresh();
    } catch (error) {
      this.toast.error(extractErrorMessage(error));
    } finally {
      this.actioningId.set(null);
    }
  }

  private async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      this.bookings.set(await this.bookingService.getBySalon(this.salonId));
    } finally {
      this.loading.set(false);
    }
  }
}
