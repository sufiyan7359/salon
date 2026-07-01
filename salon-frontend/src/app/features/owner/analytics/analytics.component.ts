import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AnalyticsSummary } from '../../../core/models/analytics.model';
import { SalonService } from '../../../core/services/salon.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { StarRatingComponent } from '../../../shared/components/star-rating/star-rating.component';
import { fadeIn } from '../../../shared/animations/fade-slide.animation';

@Component({
  selector: 'app-analytics',
  imports: [SkeletonComponent, StarRatingComponent],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss',
  animations: [fadeIn],
})
export class AnalyticsComponent implements OnInit {
  private readonly salonService = inject(SalonService);
  private readonly analyticsService = inject(AnalyticsService);

  readonly loading = signal(true);
  readonly summary = signal<AnalyticsSummary | null>(null);

  readonly maxPeakCount = computed(() =>
    Math.max(1, ...(this.summary()?.peakHours.map((h) => h.count) ?? [1])),
  );
  readonly ratingBreakdownEntries = computed(() => {
    const breakdown = this.summary()?.ratings.breakdown;
    if (!breakdown) return [];
    return (['5', '4', '3', '2', '1'] as const).map((star) => ({
      star,
      count: breakdown[star],
    }));
  });
  readonly maxRatingCount = computed(() =>
    Math.max(1, ...this.ratingBreakdownEntries().map((e) => e.count)),
  );

  async ngOnInit(): Promise<void> {
    const salon = this.salonService.salon();
    if (!salon) return;

    try {
      this.summary.set(await this.analyticsService.getSummary(salon.id));
    } finally {
      this.loading.set(false);
    }
  }
}
