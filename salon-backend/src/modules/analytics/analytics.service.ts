import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { QueueEntry, QueueStatus } from '../queue/entities/queue-entry.entity';
import { Review } from '../reviews/entities/review.entity';
import { SalonsService } from '../salons/salons.service';

const LOOKBACK_DAYS = 90;

export interface AnalyticsSummary {
  servedCounts: { today: number; week: number; month: number };
  avgWaitMinutes: number;
  revenue: { today: number; week: number; month: number };
  peakHours: { hour: number; count: number }[];
  ratings: {
    average: number;
    count: number;
    breakdown: Record<'1' | '2' | '3' | '4' | '5', number>;
  };
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(QueueEntry)
    private readonly queueEntryRepository: Repository<QueueEntry>,
    @InjectRepository(Review)
    private readonly reviewsRepository: Repository<Review>,
    private readonly salonsService: SalonsService,
  ) {}

  async getSummary(
    salonId: string,
    ownerId: string,
  ): Promise<AnalyticsSummary> {
    const salon = await this.salonsService.findByIdOrThrow(salonId);
    this.salonsService.assertOwnership(salon, ownerId);

    const lookbackStart = new Date();
    lookbackStart.setDate(lookbackStart.getDate() - LOOKBACK_DAYS);

    const [completedEntries, allRecentEntries, reviews] = await Promise.all([
      this.queueEntryRepository.find({
        where: {
          salonId,
          status: QueueStatus.COMPLETED,
          joinedAt: MoreThanOrEqual(lookbackStart),
        },
        relations: { services: true },
      }),
      this.queueEntryRepository.find({
        where: { salonId, joinedAt: MoreThanOrEqual(lookbackStart) },
        select: { id: true, joinedAt: true },
      }),
      this.reviewsRepository.find({ where: { salonId } }),
    ]);

    const todayStart = this.startOfDay(new Date());
    const weekStart = this.daysAgo(7);
    const monthStart = this.daysAgo(30);

    const servedCounts = {
      today: this.countSince(completedEntries, todayStart),
      week: this.countSince(completedEntries, weekStart),
      month: this.countSince(completedEntries, monthStart),
    };

    const revenue = {
      today: this.revenueSince(completedEntries, todayStart),
      week: this.revenueSince(completedEntries, weekStart),
      month: this.revenueSince(completedEntries, monthStart),
    };

    const avgWaitMinutes = this.averageWaitMinutes(
      completedEntries,
      monthStart,
    );
    const peakHours = this.buildPeakHours(allRecentEntries);
    const ratings = this.buildRatings(reviews);

    return { servedCounts, avgWaitMinutes, revenue, peakHours, ratings };
  }

  private countSince(entries: QueueEntry[], since: Date): number {
    return entries.filter(
      (entry) => entry.completedAt && entry.completedAt >= since,
    ).length;
  }

  private revenueSince(entries: QueueEntry[], since: Date): number {
    return entries
      .filter((entry) => entry.completedAt && entry.completedAt >= since)
      .reduce(
        (sum, entry) =>
          sum + entry.services.reduce((s, service) => s + service.price, 0),
        0,
      );
  }

  private averageWaitMinutes(entries: QueueEntry[], since: Date): number {
    const withWait = entries.filter(
      (entry) => entry.calledAt && entry.joinedAt >= since,
    );
    if (withWait.length === 0) return 0;

    const totalMinutes = withWait.reduce((sum, entry) => {
      const waitMs = entry.calledAt!.getTime() - entry.joinedAt.getTime();
      return sum + waitMs / 60_000;
    }, 0);

    return Math.round((totalMinutes / withWait.length) * 10) / 10;
  }

  private buildPeakHours(
    entries: Pick<QueueEntry, 'id' | 'joinedAt'>[],
  ): { hour: number; count: number }[] {
    const counts = new Array(24).fill(0) as number[];
    for (const entry of entries) {
      counts[entry.joinedAt.getHours()] += 1;
    }
    return counts.map((count, hour) => ({ hour, count }));
  }

  private buildRatings(reviews: Review[]): AnalyticsSummary['ratings'] {
    const breakdown: Record<'1' | '2' | '3' | '4' | '5', number> = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
    };
    for (const review of reviews) {
      const key = String(review.rating) as keyof typeof breakdown;
      if (breakdown[key] !== undefined) breakdown[key] += 1;
    }

    const count = reviews.length;
    const average =
      count === 0
        ? 0
        : Math.round(
            (reviews.reduce((sum, r) => sum + r.rating, 0) / count) * 10,
          ) / 10;

    return { average, count, breakdown };
  }

  private startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private daysAgo(days: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }
}
