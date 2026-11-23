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
  let staffService: jest.Mocked<StaffService>;
  // Stands in for the transaction's EntityManager - `find` returns the
  // staff member's existing same-day bookings for the overlap check.
  const manager = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((_entity: unknown, v: unknown) => v),
    save: jest.fn((v: unknown) => Promise.resolve(v)),
  };

  let salon: any;
  const haircut = { id: 'service-1', durationMinutes: 30 };
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
    salon = {
      id: 'salon-1',
      ownerId: 'owner-1',
      openingTime: '09:00',
      closingTime: '20:00',
    };
    manager.find.mockReset().mockResolvedValue([]);
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
            manager: {
              transaction: jest.fn((cb: (m: typeof manager) => unknown) =>
                cb(manager),
              ),
            },
          },
        },
        {
          provide: SalonsService,
          useValue: {
            findByIdOrThrow: jest.fn(() => Promise.resolve(salon)),
            assertOwnership: jest.fn(),
          },
        },
        {
          provide: ServicesService,
          useValue: {
            findActiveByIdsForSalon: jest.fn().mockResolvedValue([haircut]),
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
    staffService = module.get(StaffService);
    staffService.findByIdOrThrow.mockResolvedValue({
      id: 'staff-1',
      salonId: 'salon-1',
      isAvailable: true,
    } as any);
  });

  function bookAt(bookingTime: string, staffId?: string) {
    return service.create('customer-2', {
      salonId: 'salon-1',
      serviceId: 'service-1',
      staffId,
      bookingDate: futureDate,
      bookingTime,
    });
  }

  function existingStaffBooking(bookingTime: string, durationMinutes: number) {
    return makeBooking({
      staffId: 'staff-1',
      bookingTime,
      service: { durationMinutes } as any,
    });
  }

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
      manager.find.mockResolvedValue([existingStaffBooking('14:00', 30)]);
      await expect(bookAt('14:00', 'staff-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a booking that starts inside an existing longer booking', async () => {
      // Existing 14:00 booking runs 60 min (until 15:00); 14:30 overlaps.
      manager.find.mockResolvedValue([existingStaffBooking('14:00', 60)]);
      await expect(bookAt('14:30', 'staff-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a booking whose duration runs into the next booking', async () => {
      // New 30-min booking at 13:45 would run until 14:15.
      manager.find.mockResolvedValue([existingStaffBooking('14:00', 30)]);
      await expect(bookAt('13:45', 'staff-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('allows a back-to-back booking right after the previous one ends', async () => {
      manager.find.mockResolvedValue([existingStaffBooking('14:00', 30)]);
      const result = await bookAt('14:30', 'staff-1');
      expect(result.status).toBe(BookingStatus.PENDING);
    });

    it('locks the staff row before checking for overlaps', async () => {
      await bookAt('14:00', 'staff-1');
      expect(manager.findOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
    });

    it('rejects booking a staff member who is marked unavailable', async () => {
      staffService.findByIdOrThrow.mockResolvedValue({
        id: 'staff-1',
        salonId: 'salon-1',
        isAvailable: false,
      } as any);
      await expect(bookAt('14:00', 'staff-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a booking before the salon opens', async () => {
      await expect(bookAt('08:30')).rejects.toThrow(BadRequestException);
    });

    it('rejects a booking whose service would run past closing time', async () => {
      // 30-min service at 19:45 ends 20:15, after the 20:00 close.
      await expect(bookAt('19:45')).rejects.toThrow(BadRequestException);
    });

    it('allows a booking that ends exactly at closing time', async () => {
      const result = await bookAt('19:30');
      expect(result.status).toBe(BookingStatus.PENDING);
    });

    it('skips the hours check when the salon has no hours set', async () => {
      salon.openingTime = null;
      salon.closingTime = null;
      const result = await bookAt('07:00');
      expect(result.status).toBe(BookingStatus.PENDING);
    });

    it('creates a pending booking when there is no conflict', async () => {
      const result = await bookAt('14:00');
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
