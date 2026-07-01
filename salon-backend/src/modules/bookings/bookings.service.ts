import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Booking, BookingStatus } from './entities/booking.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { SalonsService } from '../salons/salons.service';
import { ServicesService } from '../services/services.service';
import { StaffService } from '../staff/staff.service';
import { UserRole } from '../users/entities/user.entity';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

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
    if (new Date(`${dto.bookingDate}T${dto.bookingTime}`) < new Date()) {
      throw new BadRequestException('Cannot book a date/time in the past');
    }

    await this.salonsService.findByIdOrThrow(dto.salonId);
    await this.servicesService.findActiveByIdsForSalon(dto.salonId, [
      dto.serviceId,
    ]);

    if (dto.staffId) {
      const staff = await this.staffService.findByIdOrThrow(dto.staffId);
      if (staff.salonId !== dto.salonId) {
        throw new BadRequestException(
          'Selected staff does not belong to this salon',
        );
      }

      const conflict = await this.bookingsRepository.findOne({
        where: {
          staffId: dto.staffId,
          bookingDate: dto.bookingDate,
          bookingTime: dto.bookingTime,
          status: Not(BookingStatus.CANCELLED),
        },
      });
      if (conflict) {
        throw new BadRequestException(
          'This staff member is already booked at that time',
        );
      }
    }

    const booking = this.bookingsRepository.create({
      salonId: dto.salonId,
      customerId,
      serviceId: dto.serviceId,
      staffId: dto.staffId ?? null,
      bookingDate: dto.bookingDate,
      bookingTime: dto.bookingTime,
      status: BookingStatus.PENDING,
    });

    return this.bookingsRepository.save(booking);
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
