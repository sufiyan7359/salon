import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { TranslocoPipe, translate } from '@jsverse/transloco';
import { QueueEntryWithPosition } from '../../../core/models/queue-entry.model';
import { SalonService as SalonServiceModel } from '../../../core/models/service.model';
import { Staff } from '../../../core/models/staff.model';
import { SalonService } from '../../../core/services/salon.service';
import { QueueService } from '../../../core/services/queue.service';
import { SocketService } from '../../../core/services/socket.service';
import { ToastService } from '../../../core/services/toast.service';
import { extractErrorMessage } from '../../../core/utils/http-error.util';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { fadeIn } from '../../../shared/animations/fade-slide.animation';

interface CustomerArrivingSoonPayload {
  entryId: string;
  tokenNumber: number;
  customerName: string | null;
  estimatedWaitMinutes: number | null;
}

@Component({
  selector: 'app-live-queue-manager',
  imports: [FormsModule, SkeletonComponent, TranslocoPipe],
  templateUrl: './live-queue-manager.component.html',
  styleUrl: './live-queue-manager.component.scss',
  animations: [fadeIn],
})
export class LiveQueueManagerComponent implements OnInit, OnDestroy {
  private readonly salonService = inject(SalonService);
  private readonly queueService = inject(QueueService);
  private readonly socketService = inject(SocketService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly entries = signal<QueueEntryWithPosition[]>([]);
  readonly staff = signal<Staff[]>([]);
  readonly services = signal<SalonServiceModel[]>([]);
  readonly actioningId = signal<string | null>(null);

  readonly showWalkIn = signal(false);
  readonly walkInName = signal('');
  readonly walkInPhone = signal('');
  readonly walkInServiceIds = signal<Set<string>>(new Set());
  readonly walkInStaffId = signal<string | undefined>(undefined);
  readonly submittingWalkIn = signal(false);

  readonly waitingEntries = computed(() =>
    this.entries().filter((e) => e.status === 'waiting' || e.status === 'next'),
  );
  readonly inServiceEntries = computed(() =>
    this.entries().filter((e) => e.status === 'in_service'),
  );

  private readonly subscriptions: Subscription[] = [];
  private salonId = '';

  async ngOnInit(): Promise<void> {
    const salon = this.salonService.salon();
    if (!salon) return;
    this.salonId = salon.id;

    try {
      const [entries, staff, services] = await Promise.all([
        this.queueService.getLiveQueue(this.salonId),
        this.salonService.getStaff(this.salonId),
        this.salonService.getServices(this.salonId),
      ]);
      this.entries.set(entries);
      this.staff.set(staff.filter((member) => member.isAvailable));
      this.services.set(services.filter((service) => service.isActive));
    } finally {
      this.loading.set(false);
    }

    this.socketService.joinSalonRoom(this.salonId);
    this.subscriptions.push(
      this.socketService
        .on<QueueEntryWithPosition[]>('queue_updated')
        .subscribe((list) => this.entries.set(list)),
    );

    this.subscriptions.push(
      this.socketService
        .on<CustomerArrivingSoonPayload>('customer_arriving_soon')
        .subscribe((payload) => {
          this.toast.show(
            translate('ownerQueue.toastCustomerArrivingSoon', {
              token: payload.tokenNumber,
              name: payload.customerName || translate('common.anonymous'),
              minutes: payload.estimatedWaitMinutes ?? 0,
            }),
            'info',
          );
        }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  async callNext(entry: QueueEntryWithPosition): Promise<void> {
    this.actioningId.set(entry.id);
    try {
      await this.queueService.callNext(entry.id);
      this.toast.success(translate('ownerQueue.toastTokenCalled', { token: entry.tokenNumber }));
    } catch (error) {
      this.toast.error(extractErrorMessage(error));
    } finally {
      this.actioningId.set(null);
    }
  }

  async complete(entry: QueueEntryWithPosition): Promise<void> {
    this.actioningId.set(entry.id);
    try {
      await this.queueService.complete(entry.id);
      this.toast.success(translate('ownerQueue.toastTokenCompleted', { token: entry.tokenNumber }));
    } catch (error) {
      this.toast.error(extractErrorMessage(error));
    } finally {
      this.actioningId.set(null);
    }
  }

  async noShow(entry: QueueEntryWithPosition): Promise<void> {
    this.actioningId.set(entry.id);
    try {
      await this.queueService.noShow(entry.id);
      this.toast.show(translate('ownerQueue.toastTokenNoShow', { token: entry.tokenNumber }), 'info');
    } catch (error) {
      this.toast.error(extractErrorMessage(error));
    } finally {
      this.actioningId.set(null);
    }
  }

  async remove(entry: QueueEntryWithPosition): Promise<void> {
    this.actioningId.set(entry.id);
    try {
      await this.queueService.leave(entry.id);
      this.toast.show(translate('ownerQueue.toastTokenRemoved', { token: entry.tokenNumber }), 'info');
    } catch (error) {
      this.toast.error(extractErrorMessage(error));
    } finally {
      this.actioningId.set(null);
    }
  }

  toggleWalkInService(serviceId: string): void {
    this.walkInServiceIds.update((current) => {
      const next = new Set(current);
      if (next.has(serviceId)) {
        next.delete(serviceId);
      } else {
        next.add(serviceId);
      }
      return next;
    });
  }

  async submitWalkIn(): Promise<void> {
    if (!this.walkInName().trim() || !this.walkInPhone().trim()) {
      this.toast.error(translate('ownerQueue.toastNamePhoneRequired'));
      return;
    }
    if (this.walkInServiceIds().size === 0) {
      this.toast.error(translate('ownerQueue.toastSelectService'));
      return;
    }

    this.submittingWalkIn.set(true);
    try {
      await this.queueService.walkIn(this.salonId, {
        customerName: this.walkInName().trim(),
        customerPhone: this.walkInPhone().trim(),
        serviceIds: [...this.walkInServiceIds()],
        staffId: this.walkInStaffId(),
      });
      this.toast.success(translate('ownerQueue.toastWalkInAdded'));
      this.walkInName.set('');
      this.walkInPhone.set('');
      this.walkInServiceIds.set(new Set());
      this.walkInStaffId.set(undefined);
      this.showWalkIn.set(false);
    } catch (error) {
      this.toast.error(extractErrorMessage(error));
    } finally {
      this.submittingWalkIn.set(false);
    }
  }
}
