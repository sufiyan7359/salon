import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import {
  ACTIVE_QUEUE_STATUSES,
  QUEUE_STATUS_LABELS,
  QueueEntryWithPosition,
} from '../../../core/models/queue-entry.model';
import { QueueService } from '../../../core/services/queue.service';
import { SocketService } from '../../../core/services/socket.service';
import { ToastService } from '../../../core/services/toast.service';
import { ReviewService } from '../../../core/services/review.service';
import { AuthService } from '../../../core/services/auth.service';
import { extractErrorMessage } from '../../../core/utils/http-error.util';
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

interface YourTurnSoonPayload {
  entryId: string;
  peopleAhead: number;
}

@Component({
  selector: 'app-live-tracking',
  imports: [SkeletonComponent, StarRatingComponent, FormsModule],
  templateUrl: './live-tracking.component.html',
  styleUrl: './live-tracking.component.scss',
  animations: [fadeIn, numberBump],
})
export class LiveTrackingComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly queueService = inject(QueueService);
  private readonly socketService = inject(SocketService);
  private readonly toast = inject(ToastService);
  private readonly reviewService = inject(ReviewService);
  private readonly authService = inject(AuthService);

  readonly loading = signal(true);
  readonly entry = signal<QueueEntryWithPosition | null>(null);
  readonly leaving = signal(false);
  readonly notFound = signal(false);

  readonly reviewSubmitted = signal(false);
  readonly reviewRating = signal(0);
  readonly reviewComment = signal('');
  readonly submittingReview = signal(false);

  readonly statusLabel = computed(
    () => QUEUE_STATUS_LABELS[this.entry()?.status ?? 'waiting'],
  );
  readonly isActive = computed(() => {
    const status = this.entry()?.status;
    return !!status && ACTIVE_QUEUE_STATUSES.includes(status);
  });
  readonly progressPercent = computed(() => {
    const current = this.entry();
    if (!current) return 0;
    if (current.status === 'completed') return 100;
    if (current.status === 'in_service') return 90;
    return Math.min(80, Math.max(8, 80 - current.peopleAhead * 15));
  });
  // Only the customer who actually owns this entry can review it - an owner
  // viewing a customer's page (e.g. to check on them) shouldn't see a review
  // form they're not allowed to submit.
  readonly canReview = computed(
    () => this.authService.currentUser()?.id === this.entry()?.customerId,
  );

  private entryId = '';
  private readonly subscriptions: Subscription[] = [];

  async ngOnInit(): Promise<void> {
    this.entryId = this.route.snapshot.paramMap.get('entryId') ?? '';
    if (!this.entryId) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }

    await this.loadStatus();
    this.socketService.joinQueueRoom(this.entryId);

    this.subscriptions.push(
      this.socketService
        .on<StatusChangedPayload>('status_changed')
        .subscribe((payload) => this.applyStatusChange(payload)),
    );

    this.subscriptions.push(
      this.socketService
        .on<YourTurnSoonPayload>('your_turn_soon')
        .subscribe((payload) => {
          if (payload.entryId !== this.entryId) return;
          this.toast.show("You're almost up! Please head to the salon.", 'info');
        }),
    );
  }

  ngOnDestroy(): void {
    this.socketService.leaveQueueRoom(this.entryId);
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  async leaveQueue(): Promise<void> {
    this.leaving.set(true);
    try {
      await this.queueService.leave(this.entryId);
      this.clearActiveEntryIfMine();
      this.toast.success('You left the queue');
      await this.router.navigate(['/']);
    } catch (error) {
      this.toast.error(extractErrorMessage(error));
    } finally {
      this.leaving.set(false);
    }
  }

  async submitReview(): Promise<void> {
    const current = this.entry();
    if (!current) return;

    if (this.reviewRating() === 0) {
      this.toast.error('Select a star rating first');
      return;
    }

    this.submittingReview.set(true);
    try {
      await this.reviewService.create({
        salonId: current.salonId,
        rating: this.reviewRating(),
        comment: this.reviewComment().trim() || undefined,
      });
      this.reviewSubmitted.set(true);
      this.toast.success('Thanks for your feedback!');
    } catch (error) {
      this.toast.error(extractErrorMessage(error));
    } finally {
      this.submittingReview.set(false);
    }
  }

  private async loadStatus(): Promise<void> {
    try {
      const entry = await this.queueService.getMyStatus(this.entryId);
      this.entry.set(entry);
      this.socketService.joinSalonRoom(entry.salonId);
      this.syncActiveEntryTracking(entry.status);
    } catch (error) {
      this.notFound.set(true);
      this.toast.error(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private applyStatusChange(payload: StatusChangedPayload): void {
    if (payload.entryId !== this.entryId) return;
    this.entry.update((current) =>
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
    this.syncActiveEntryTracking(payload.status);
  }

  // Keeps the "active queue entry" tracked in localStorage (used by the
  // landing page banner) in sync with this entry's real status.
  private syncActiveEntryTracking(status: QueueEntryWithPosition['status']): void {
    const isActive = ACTIVE_QUEUE_STATUSES.includes(status);
    if (isActive) {
      this.queueService.setActiveEntry(this.entryId);
    } else {
      this.clearActiveEntryIfMine();
    }
  }

  private clearActiveEntryIfMine(): void {
    if (this.queueService.getActiveEntryId() === this.entryId) {
      this.queueService.clearActiveEntry();
    }
  }
}
