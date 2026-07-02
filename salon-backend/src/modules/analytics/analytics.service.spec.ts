import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { AnalyticsService } from './analytics.service';
import { QueueEntry } from '../queue/entities/queue-entry.entity';
import { Review } from '../reviews/entities/review.entity';
import { Booking, BookingStatus } from '../bookings/entities/booking.entity';
import { SalonsService } from '../salons/salons.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let bookingsRepository: jest.Mocked<Repository<Booking>>;

  const salon = { id: 'salon-1', ownerId: 'owner-1' } as any;

  // Local calendar date, matching how the service itself buckets bookingDate
  // (a plain "YYYY-MM-DD" with no timezone) - toISOString() would be off by
  // a day here whenever local time and UTC land on different calendar dates.
  function localDateOnly(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const today = localDateOnly(new Date());

  function makeBooking(overrides: Partial<Booking> = {}): Booking {
    return {
      id: 'booking-1',
      salonId: 'salon-1',
      status: BookingStatus.COMPLETED,
      bookingDate: today,
      bookingTime: '14:00',
      service: { id: 'service-1', price: 250 },
      createdAt: new Date(),
      ...overrides,
    } as unknown as Booking;
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: getRepositoryToken(QueueEntry),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(Review),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(Booking),
          useValue: { find: jest.fn().mockResolvedValue([makeBooking()]) },
        },
        {
          provide: SalonsService,
          useValue: {
            findByIdOrThrow: jest.fn().mockResolvedValue(salon),
            assertOwnership: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(AnalyticsService);
    bookingsRepository = module.get(getRepositoryToken(Booking));
  });

  it('folds completed booking revenue and counts into the summary', async () => {
    const summary = await service.getSummary('salon-1', 'owner-1');

    expect(summary.servedCounts.today).toBe(1);
    expect(summary.revenue.today).toBe(250);
    expect(bookingsRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          salonId: 'salon-1',
          status: BookingStatus.COMPLETED,
        }),
      }),
    );
  });

  it('excludes bookings outside the requested window', async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 40);
    (bookingsRepository.find as jest.Mock).mockResolvedValue([
      makeBooking({ bookingDate: localDateOnly(oldDate) }),
    ]);

    const summary = await service.getSummary('salon-1', 'owner-1');

    expect(summary.servedCounts.today).toBe(0);
    expect(summary.servedCounts.week).toBe(0);
    expect(summary.revenue.month).toBe(0);
  });
});
