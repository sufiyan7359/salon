import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { BookingsService } from './bookings.service';
import { Booking, BookingStatus } from './entities/booking.entity';
import { SalonsService } from '../salons/salons.service';
import { ServicesService } from '../services/services.service';
import { StaffService } from '../staff/staff.service';
import { UserRole } from '../users/entities/user.entity';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

describe('BookingsService', () => {
  let service: BookingsService;
  let bookingsRepository: jest.Mocked<Repository<Booking>>;

  const salon = { id: 'salon-1', ownerId: 'owner-1' } as any;
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  function makeBooking(overrides: Partial<Booking> = {}): Booking {
    return {
      id: 'booking-1',
      salonId: 'salon-1',
      customerId: 'customer-1',
      serviceId: 'service-1',
      staffId: null,
      bookingDate: futureDate,
      bookingTime: '14:00',
      status: BookingStatus.PENDING,
      createdAt: new Date(),
      ...overrides,
    } as Booking;
  }

  const ownerRequester: AuthenticatedUser = {
    userId: 'owner-1',
    role: UserRole.OWNER,
    phoneNumber: null,
    email: null,
  };
  const customerRequester: AuthenticatedUser = {
    userId: 'customer-1',
    role: UserRole.CUSTOMER,
    phoneNumber: null,
    email: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        {
          provide: getRepositoryToken(Booking),
          useValue: {
            create: jest.fn((v) => v),
            save: jest.fn((v) => Promise.resolve(v)),
            find: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: SalonsService,
          useValue: {
            findByIdOrThrow: jest.fn().mockResolvedValue(salon),
            assertOwnership: jest.fn(),
          },
        },
        {
          provide: ServicesService,
          useValue: {
            findActiveByIdsForSalon: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: StaffService,
          useValue: { findByIdOrThrow: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(BookingsService);
    bookingsRepository = module.get(getRepositoryToken(Booking));
  });

  describe('create', () => {
    it('rejects a booking in the past', async () => {
      await expect(
        service.create('customer-1', {
          salonId: 'salon-1',
          serviceId: 'service-1',
          bookingDate: '2000-01-01',
          bookingTime: '10:00',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects double-booking the same staff at the same date/time', async () => {
      const staffService = service['staffService'] as jest.Mocked<StaffService>;
      staffService.findByIdOrThrow.mockResolvedValue({
        id: 'staff-1',
        salonId: 'salon-1',
      } as any);
      bookingsRepository.findOne.mockResolvedValue(
        makeBooking({ staffId: 'staff-1' }),
      );

      await expect(
        service.create('customer-2', {
          salonId: 'salon-1',
          serviceId: 'service-1',
          staffId: 'staff-1',
          bookingDate: futureDate,
          bookingTime: '14:00',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a pending booking when there is no conflict', async () => {
      bookingsRepository.findOne.mockResolvedValue(null);

      const result = await service.create('customer-1', {
        salonId: 'salon-1',
        serviceId: 'service-1',
        bookingDate: futureDate,
        bookingTime: '14:00',
      });

      expect(result.status).toBe(BookingStatus.PENDING);
    });
  });

  describe('updateStatus transition rules', () => {
    it('lets the owner confirm a pending booking', async () => {
      bookingsRepository.findOne.mockResolvedValue(makeBooking());

      const result = await service.updateStatus(
        'booking-1',
        ownerRequester,
        BookingStatus.CONFIRMED,
      );
      expect(result.status).toBe(BookingStatus.CONFIRMED);
    });

    it('rejects the owner completing a still-pending booking', async () => {
      bookingsRepository.findOne.mockResolvedValue(makeBooking());

      await expect(
        service.updateStatus(
          'booking-1',
          ownerRequester,
          BookingStatus.COMPLETED,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects moving a completed booking back to any other status', async () => {
      bookingsRepository.findOne.mockResolvedValue(
        makeBooking({ status: BookingStatus.COMPLETED }),
      );

      await expect(
        service.updateStatus(
          'booking-1',
          ownerRequester,
          BookingStatus.CANCELLED,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('lets the owning customer cancel their own pending booking', async () => {
      bookingsRepository.findOne.mockResolvedValue(makeBooking());

      const result = await service.updateStatus(
        'booking-1',
        customerRequester,
        BookingStatus.CANCELLED,
      );
      expect(result.status).toBe(BookingStatus.CANCELLED);
    });

    it('rejects a customer trying to confirm their own booking', async () => {
      bookingsRepository.findOne.mockResolvedValue(makeBooking());

      await expect(
        service.updateStatus(
          'booking-1',
          customerRequester,
          BookingStatus.CONFIRMED,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects a stranger managing someone else's booking", async () => {
      bookingsRepository.findOne.mockResolvedValue(makeBooking());
      const stranger: AuthenticatedUser = {
        userId: 'stranger',
        role: UserRole.CUSTOMER,
        phoneNumber: null,
        email: null,
      };

      await expect(
        service.updateStatus('booking-1', stranger, BookingStatus.CANCELLED),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
