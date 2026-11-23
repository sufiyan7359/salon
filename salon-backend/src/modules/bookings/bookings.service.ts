import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Not, Repository } from 'typeorm';
import { Booking, BookingStatus } from './entities/booking.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { SalonsService } from '../salons/salons.service';
import { ServicesService } from '../services/services.service';
import { StaffService } from '../staff/staff.service';
import { Salon } from '../salons/entities/salon.entity';
import { Staff } from '../staff/entities/staff.entity';
import { UserRole } from '../users/entities/user.entity';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { parseIstDateTime } from '../../common/utils/ist-time.util';

// "HH:mm" -> minutes since midnight, or null if missing/malformed.
function toMinutes(time: string | null | undefined): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(time ?? '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

const OWNER_ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.PENDING]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
  [BookingStatus.CONFIRMED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.COMPLETED]: [],
  [BookingStatus.CANCELLED]: [],
};

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    private readonly salonsService: SalonsService,
    private readonly servicesService: ServicesService,
    private readonly staffService: StaffService,
  ) {}

  async create(customerId: string, dto: CreateBookingDto): Promise<Booking> {
    if (parseIstDateTime(dto.bookingDate, dto.bookingTime) < new Date()) {
      throw new BadRequestException('Cannot book a date/time in the past');
    }

    const salon = await this.salonsService.findByIdOrThrow(dto.salonId);
    const [service] = await this.servicesService.findActiveByIdsForSalon(
      dto.salonId,
      [dto.serviceId],
    );

    const startMinutes = toMinutes(dto.bookingTime)!;
    const endMinutes = startMinutes + service.durationMinutes;
    this.assertWithinOpeningHours(salon, startMinutes, endMinutes);

    if (dto.staffId) {
      const staff = await this.staffService.findByIdOrThrow(dto.staffId);
      if (staff.salonId !== dto.salonId) {
        throw new BadRequestException(
          'Selected staff does not belong to this salon',
        );
      }
      if (!staff.isAvailable) {
        throw new BadRequestException(
          'Selected staff member is not taking bookings right now',
        );
      }
    }

    // The overlap check and the insert must be atomic per staff member -
    // otherwise two customers booking the same stylist at nearly the same
    // moment could both pass the check before either has saved. Locking the
    // Staff row serializes bookings for that one stylist only.
    return this.bookingsRepository.manager.transaction(async (manager) => {
      if (dto.staffId) {
        await manager.findOne(Staff, {
          where: { id: dto.staffId },
          lock: { mode: 'pessimistic_write' },
        });
        await this.assertStaffFree(
          manager,
          dto.staffId,
          dto.bookingDate,
          startMinutes,
          endMinutes,
        );
      }

      const booking = manager.create(Booking, {
        salonId: dto.salonId,
        customerId,
        serviceId: dto.serviceId,
        staffId: dto.staffId ?? null,
        bookingDate: dto.bookingDate,
        bookingTime: dto.bookingTime,
        status: BookingStatus.PENDING,
      });

      return manager.save(booking);
    });
  }

  // Skipped when the owner hasn't set hours (or set something unparseable)
  // rather than blocking every booking - opening/closing time are optional.
  private assertWithinOpeningHours(
    salon: Salon,
    startMinutes: number,
    endMinutes: number,
  ): void {
    const opening = toMinutes(salon.openingTime);
    const closing = toMinutes(salon.closingTime);
    if (opening === null || closing === null || closing <= opening) return;

    if (startMinutes < opening || endMinutes > closing) {
      throw new BadRequestException(
        `The salon is open ${salon.openingTime}-${salon.closingTime}. ` +
          'Please pick a time when the whole service fits within those hours.',
      );
    }
  }

  // Two bookings clash if their [start, start + service duration) windows
  // overlap at all - not just when they start at the exact same minute.
  private async assertStaffFree(
    manager: EntityManager,
    staffId: string,
    bookingDate: string,
    startMinutes: number,
    endMinutes: number,
  ): Promise<void> {
    const sameDay = await manager.find(Booking, {
      where: {
        staffId,
        bookingDate,
        status: Not(BookingStatus.CANCELLED),
      },
      relations: { service: true },
    });

    const conflict = sameDay.find((existing) => {
      const existingStart = toMinutes(existing.bookingTime);
      if (existingStart === null) return false;
      const existingEnd = existingStart + existing.service.durationMinutes;
      return startMinutes < existingEnd && existingStart < endMinutes;
    });

    if (conflict) {
      throw new BadRequestException(
        `This staff member already has a booking at ${conflict.bookingTime} that overlaps this time. Please pick another time or staff member.`,
      );
    }
  }

  findBySalon(salonId: string) {
    return this.bookingsRepository.find({
      where: { salonId },
      relations: { customer: true, service: true, staff: true },
      order: { bookingDate: 'ASC', bookingTime: 'ASC' },
    });
  }

  findMine(customerId: string) {
    return this.bookingsRepository.find({
      where: { customerId },
      relations: { service: true, staff: true, salon: true },
      order: { bookingDate: 'ASC', bookingTime: 'ASC' },
    });
  }

  async updateStatus(
    id: string,
    requester: AuthenticatedUser,
    status: BookingStatus,
  ): Promise<Booking> {
    const booking = await this.findByIdOrThrow(id);
    const isOwningCustomer = booking.customerId === requester.userId;

    if (isOwningCustomer) {
      if (status !== BookingStatus.CANCELLED) {
        throw new ForbiddenException(
          'Customers may only cancel their own bookings',
        );
      }
    } else {
      const salon = await this.salonsService.findByIdOrThrow(booking.salonId);
      if (
        requester.role !== UserRole.OWNER ||
        salon.ownerId !== requester.userId
      ) {
        throw new ForbiddenException('You cannot manage this booking');
      }
    }

    if (!OWNER_ALLOWED_TRANSITIONS[booking.status].includes(status)) {
      throw new BadRequestException(
        `Cannot move a ${booking.status} booking to ${status}`,
      );
    }

    booking.status = status;
    return this.bookingsRepository.save(booking);
  }

  private async findByIdOrThrow(id: string): Promise<Booking> {
    const booking = await this.bookingsRepository.findOne({
      where: { id },
      relations: { customer: true, service: true, staff: true },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    return booking;
  }
}
