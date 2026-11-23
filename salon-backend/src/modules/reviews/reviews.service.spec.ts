import { BadRequestException, ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { ReviewsService } from './reviews.service';
import { Review } from './entities/review.entity';
import { Salon } from '../salons/entities/salon.entity';
import { QueueEntry, QueueStatus } from '../queue/entities/queue-entry.entity';
import { Booking, BookingStatus } from '../bookings/entities/booking.entity';
import { SalonsService } from '../salons/salons.service';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let reviewsRepository: jest.Mocked<Repository<Review>>;
  let queueEntryRepository: jest.Mocked<Repository<QueueEntry>>;
  let bookingsRepository: jest.Mocked<Repository<Booking>>;
  let salonsRepository: jest.Mocked<Repository<Salon>>;

  const queryBuilderMock = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ avg: '4.5' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        {
          provide: getRepositoryToken(Review),
          useValue: {
            create: jest.fn((v) => v),
            save: jest.fn((v) => Promise.resolve({ id: 'review-1', ...v })),
            find: jest.fn(),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(() => queryBuilderMock),
          },
        },
        {
          provide: getRepositoryToken(Salon),
          useValue: { update: jest.fn() },
        },
        {
          provide: getRepositoryToken(QueueEntry),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Booking),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: SalonsService,
          useValue: {
            findByIdOrThrow: jest.fn().mockResolvedValue({ id: 'salon-1' }),
          },
        },
      ],
    }).compile();

    service = module.get(ReviewsService);
    reviewsRepository = module.get(getRepositoryToken(Review));
    queueEntryRepository = module.get(getRepositoryToken(QueueEntry));
    bookingsRepository = module.get(getRepositoryToken(Booking));
    salonsRepository = module.get(getRepositoryToken(Salon));
  });

  it('blocks a second review from the same customer for the same salon', async () => {
    reviewsRepository.findOne.mockResolvedValue({
      id: 'existing-review',
    } as any);

    await expect(
      service.create('customer-1', { salonId: 'salon-1', rating: 5 }),
    ).rejects.toThrow(ConflictException);
  });

  it('blocks a review from a customer with no completed visit', async () => {
    reviewsRepository.findOne.mockResolvedValue(null);
    queueEntryRepository.findOne.mockResolvedValue(null);
    bookingsRepository.findOne.mockResolvedValue(null);

    await expect(
      service.create('customer-1', { salonId: 'salon-1', rating: 5 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows a review backed by a completed queue visit', async () => {
    reviewsRepository.findOne.mockResolvedValue(null);
    queueEntryRepository.findOne.mockResolvedValue({
      status: QueueStatus.COMPLETED,
    } as any);

    const result = await service.create('customer-1', {
      salonId: 'salon-1',
      rating: 5,
      comment: 'Great!',
    });

    expect(result.rating).toBe(5);
    expect(salonsRepository.update).toHaveBeenCalledWith(
      { id: 'salon-1' },
      { avgRating: 4.5 },
    );
  });

  it('allows a review backed by a completed booking when there is no queue visit', async () => {
    reviewsRepository.findOne.mockResolvedValue(null);
    queueEntryRepository.findOne.mockResolvedValue(null);
    bookingsRepository.findOne.mockResolvedValue({
      status: BookingStatus.COMPLETED,
    } as any);

    const result = await service.create('customer-1', {
      salonId: 'salon-1',
      rating: 4,
    });
    expect(result.rating).toBe(4);
  });
});
