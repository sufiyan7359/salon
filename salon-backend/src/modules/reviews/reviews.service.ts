import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './entities/review.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { Salon } from '../salons/entities/salon.entity';
import { QueueEntry, QueueStatus } from '../queue/entities/queue-entry.entity';
import { Booking, BookingStatus } from '../bookings/entities/booking.entity';
import { SalonsService } from '../salons/salons.service';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewsRepository: Repository<Review>,
    @InjectRepository(Salon)
    private readonly salonsRepository: Repository<Salon>,
    @InjectRepository(QueueEntry)
    private readonly queueEntryRepository: Repository<QueueEntry>,
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    private readonly salonsService: SalonsService,
  ) {}

  async create(customerId: string, dto: CreateReviewDto): Promise<Review> {
    await this.salonsService.findByIdOrThrow(dto.salonId);

    const existing = await this.reviewsRepository.findOne({
      where: { salonId: dto.salonId, customerId },
    });
    if (existing) {
      throw new ConflictException('You have already reviewed this salon');
    }

    const hasCompletedVisit = await this.hasCompletedVisit(
      dto.salonId,
      customerId,
    );
    if (!hasCompletedVisit) {
      throw new BadRequestException(
        'You can only review a salon after completing a visit',
      );
    }

    const review = this.reviewsRepository.create({
      salonId: dto.salonId,
      customerId,
      rating: dto.rating,
      comment: dto.comment ?? null,
    });
    const saved = await this.reviewsRepository.save(review);

    await this.recomputeAvgRating(dto.salonId);
    return saved;
  }

  findBySalon(salonId: string) {
    return this.reviewsRepository.find({
      where: { salonId },
      relations: { customer: true },
      order: { createdAt: 'DESC' },
    });
  }

  private async hasCompletedVisit(
    salonId: string,
    customerId: string,
  ): Promise<boolean> {
    const completedQueueEntry = await this.queueEntryRepository.findOne({
      where: { salonId, customerId, status: QueueStatus.COMPLETED },
    });
    if (completedQueueEntry) return true;

    const completedBooking = await this.bookingsRepository.findOne({
      where: { salonId, customerId, status: BookingStatus.COMPLETED },
    });
    return !!completedBooking;
  }

  private async recomputeAvgRating(salonId: string): Promise<void> {
    const result = await this.reviewsRepository
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'avg')
      .where('review.salonId = :salonId', { salonId })
      .getRawOne<{ avg: string | null }>();

    const avg = result?.avg;

    await this.salonsRepository.update(
      { id: salonId },
      { avgRating: avg ? Math.round(parseFloat(avg) * 10) / 10 : 0 },
    );
  }
}
