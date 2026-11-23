import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, translate } from '@jsverse/transloco';
import {
  ACTIVE_QUEUE_STATUSES,
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

interface WaitAnchor {
  minutes: number;
  anchoredAt: number;
}

const WAIT_TICK_INTERVAL_MS = 15_000;

@Component({
  selector: 'app-live-tracking',
  imports: [SkeletonComponent, StarRatingComponent, FormsModule, TranslocoPipe],
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

  // Ticks down live between backend updates instead of sitting frozen at
  // whatever estimate was last pushed. Anchored to a timestamp persisted in
  // localStorage so a page reload continues the countdown rather than
  // resetting it, as long as the backend's own estimate hasn't changed.
  readonly displayWaitMinutes = signal<number | null>(null);

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
  private waitAnchor: WaitAnchor | null = null;
  private waitTickTimer?: ReturnType<typeof setInterval>;

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
          this.toast.show(translate('liveTracking.toastAlmostUp'), 'info');
        }),
    );

    this.waitTickTimer = setInterval(() => this.tickWaitCountdown(), WAIT_TICK_INTERVAL_MS);
  }

  ngOnDestroy(): void {
    this.socketService.leaveQueueRoom(this.entryId);
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    if (this.waitTickTimer) clearInterval(this.waitTickTimer);
  }

  async leaveQueue(): Promise<void> {
    this.leaving.set(true);
    try {
      await this.queueService.leave(this.entryId);
      this.clearActiveEntryIfMine();
      localStorage.removeItem(this.anchorStorageKey());
      this.toast.success(translate('liveTracking.toastLeftQueue'));
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
      this.toast.error(translate('liveTracking.toastSelectRating'));
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
      this.toast.success(translate('liveTracking.toastFeedbackThanks'));
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
      this.setWaitAnchor(entry.estimatedWaitMinutes);
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
    this.setWaitAnchor(payload.estimatedWaitMinutes);
  }

  private anchorStorageKey(): string {
    return `salon_wait_anchor_${this.entryId}`;
  }

  private setWaitAnchor(minutes: number | null): void {
    if (minutes === null || !this.isActive()) {
      this.waitAnchor = null;
      this.displayWaitMinutes.set(minutes);
      localStorage.removeItem(this.anchorStorageKey());
      return;
    }

    // If the backend's estimate hasn't actually changed, keep the original
    // anchor timestamp (including one restored from before a reload) so the
    // countdown keeps ticking from real elapsed time instead of jumping back
    // up to the full value. A different value means the queue genuinely
    // moved, so re-anchor to now.
    const stored = this.waitAnchor ?? this.readWaitAnchor();
    if (stored && stored.minutes === minutes) {
      this.waitAnchor = stored;
    } else {
      this.waitAnchor = { minutes, anchoredAt: Date.now() };
      localStorage.setItem(this.anchorStorageKey(), JSON.stringify(this.waitAnchor));
    }
    this.tickWaitCountdown();
  }

  private readWaitAnchor(): WaitAnchor | null {
    const raw = localStorage.getItem(this.anchorStorageKey());
    if (!raw) return null;
    try {
      return JSON.parse(raw) as WaitAnchor;
    } catch {
      return null;
    }
  }

  private tickWaitCountdown(): void {
    if (!this.waitAnchor) return;
    const elapsedMinutes = (Date.now() - this.waitAnchor.anchoredAt) / 60_000;
    this.displayWaitMinutes.set(Math.max(0, Math.round(this.waitAnchor.minutes - elapsedMinutes)));
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
