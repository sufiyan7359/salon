import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Salon } from '../../../core/models/salon.model';
import { SalonService as SalonServiceModel } from '../../../core/models/service.model';
import { Staff } from '../../../core/models/staff.model';
import { Review } from '../../../core/models/review.model';
import { SalonService } from '../../../core/services/salon.service';
import { QueueService } from '../../../core/services/queue.service';
import { ReviewService } from '../../../core/services/review.service';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { StarRatingComponent } from '../../../shared/components/star-rating/star-rating.component';
import { fadeIn } from '../../../shared/animations/fade-slide.animation';

@Component({
  selector: 'app-landing',
  imports: [RouterLink, SkeletonComponent, StarRatingComponent],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
  animations: [fadeIn],
})
export class LandingComponent implements OnInit {
  private readonly salonService = inject(SalonService);
  private readonly queueService = inject(QueueService);
  private readonly reviewService = inject(ReviewService);

  readonly salon = signal<Salon | null>(null);
  readonly services = signal<SalonServiceModel[]>([]);
  readonly staff = signal<Staff[]>([]);
  readonly reviews = signal<Review[]>([]);
  readonly waitingCount = signal(0);
  readonly loading = signal(true);
  readonly notFound = signal(false);

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
  }
}
