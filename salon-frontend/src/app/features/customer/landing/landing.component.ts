import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { Salon } from '../../../core/models/salon.model';
import { SalonService as SalonServiceModel } from '../../../core/models/service.model';
import { Staff } from '../../../core/models/staff.model';
import { Review } from '../../../core/models/review.model';
import {
  ACTIVE_QUEUE_STATUSES,
  QUEUE_STATUS_LABELS,
  QueueEntryWithPosition,
} from '../../../core/models/queue-entry.model';
import { SalonService } from '../../../core/services/salon.service';
import { QueueService } from '../../../core/services/queue.service';
import { ReviewService } from '../../../core/services/review.service';
import { SocketService } from '../../../core/services/socket.service';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { StarRatingComponent } from '../../../shared/components/star-rating/star-rating.component';
import { fadeIn, numberBump } from '../../../shared/animations/fade-slide.animation';

interface StatusChangedPayload {
  entryId: string;
  status: QueueEntryWithPosition['status'];
  position: number;
  peopleAhead: number;
  estimatedWaitMinutes: number | null;
}

@Component({
  selector: 'app-landing',
  imports: [RouterLink, SkeletonComponent, StarRatingComponent],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
  animations: [fadeIn, numberBump],
})
export class LandingComponent implements OnInit, OnDestroy {
  private readonly salonService = inject(SalonService);
  private readonly queueService = inject(QueueService);
  private readonly reviewService = inject(ReviewService);
  private readonly socketService = inject(SocketService);

  readonly salon = signal<Salon | null>(null);
  readonly services = signal<SalonServiceModel[]>([]);
  readonly staff = signal<Staff[]>([]);
  readonly reviews = signal<Review[]>([]);
  readonly waitingCount = signal(0);
  readonly loading = signal(true);
  readonly notFound = signal(false);

  readonly myEntry = signal<QueueEntryWithPosition | null>(null);
  readonly myEntryStatusLabel = signal('');

  private activeEntryId: string | null = null;
  private readonly subscriptions: Subscription[] = [];

  async ngOnInit(): Promise<void> {
    try {
      const salon = await this.salonService.getTheSalon();
      if (!salon) {
        this.notFound.set(true);
        return;
      }
      this.salon.set(salon);

      const [services, staff, liveQueue, reviews] = await Promise.all([
        this.salonService.getServices(salon.id),
        this.salonService.getStaff(salon.id),
        this.queueService.getLiveQueue(salon.id),
        this.reviewService.getBySalon(salon.id),
      ]);

      this.services.set(services.filter((service) => service.isActive));
      this.staff.set(staff.filter((member) => member.isAvailable));
      this.waitingCount.set(liveQueue.length);
      this.reviews.set(reviews);
    } finally {
      this.loading.set(false);
    }

    await this.loadMyActiveEntry();
  }

  ngOnDestroy(): void {
    if (this.activeEntryId) {
      this.socketService.leaveQueueRoom(this.activeEntryId);
    }
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  private async loadMyActiveEntry(): Promise<void> {
    const entryId = this.queueService.getActiveEntryId();
    if (!entryId) return;

    try {
      const entry = await this.queueService.getMyStatus(entryId);
      this.myEntry.set(entry);
      this.myEntryStatusLabel.set(QUEUE_STATUS_LABELS[entry.status]);
      this.activeEntryId = entryId;

      this.socketService.joinQueueRoom(entryId);
      this.subscriptions.push(
        this.socketService
          .on<StatusChangedPayload>('status_changed')
          .subscribe((payload) => this.applyStatusChange(payload)),
      );
    } catch {
      // Entry no longer exists or isn't ours anymore - stop tracking it.
      this.queueService.clearActiveEntry();
    }
  }

  private applyStatusChange(payload: StatusChangedPayload): void {
    if (payload.entryId !== this.activeEntryId) return;

    if (!ACTIVE_QUEUE_STATUSES.includes(payload.status)) {
      // Terminal state (completed/cancelled/no_show) - the banner's job is
      // done, so remove it instead of showing a stale "Completed" chip
      // sitting on the home page forever.
      this.myEntry.set(null);
      this.socketService.leaveQueueRoom(this.activeEntryId);
      this.activeEntryId = null;
      this.queueService.clearActiveEntry();
      return;
    }

    this.myEntry.update((current) =>
      current
        ? {
            ...current,
            status: payload.status,
            position: payload.position,
            peopleAhead: payload.peopleAhead,
            estimatedWaitMinutes: payload.estimatedWaitMinutes,
          }
        : current,
    );
    this.myEntryStatusLabel.set(QUEUE_STATUS_LABELS[payload.status]);
  }
}
