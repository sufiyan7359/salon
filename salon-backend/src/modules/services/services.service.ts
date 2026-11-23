import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Service } from './entities/service.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { QueueEntry } from '../queue/entities/queue-entry.entity';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { SalonsService } from '../salons/salons.service';

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Service)
    private readonly servicesRepository: Repository<Service>,
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    @InjectRepository(QueueEntry)
    private readonly queueEntryRepository: Repository<QueueEntry>,
    private readonly salonsService: SalonsService,
  ) {}

  findBySalon(salonId: string) {
    return this.servicesRepository.find({ where: { salonId } });
  }

  async findByIdOrThrow(id: string): Promise<Service> {
    const service = await this.servicesRepository.findOne({ where: { id } });
    if (!service) {
      throw new NotFoundException('Service not found');
    }
    return service;
  }

  async create(
    salonId: string,
    ownerId: string,
    dto: CreateServiceDto,
  ): Promise<Service> {
    const salon = await this.salonsService.findByIdOrThrow(salonId);
    this.salonsService.assertOwnership(salon, ownerId);

    const service = this.servicesRepository.create({ ...dto, salonId });
    return this.servicesRepository.save(service);
  }

  async update(
    id: string,
    ownerId: string,
    dto: UpdateServiceDto,
  ): Promise<Service> {
    const service = await this.findByIdOrThrow(id);
    const salon = await this.salonsService.findByIdOrThrow(service.salonId);
    this.salonsService.assertOwnership(salon, ownerId);

    Object.assign(service, dto);
    return this.servicesRepository.save(service);
  }

  async remove(id: string, ownerId: string): Promise<void> {
    const service = await this.findByIdOrThrow(id);
    const salon = await this.salonsService.findByIdOrThrow(service.salonId);
    this.salonsService.assertOwnership(salon, ownerId);

    // Deleting a service cascades onto every Booking and queue-entry link
    // that references it (see the FK constraints in the initial migration) -
    // including historical/completed ones, which would silently erase past
    // booking records and shrink completed queue visits' revenue in
    // analytics. Block the hard delete once it's actually been used; the
    // owner already has `isActive` to retire a service from new bookings.
    const [bookingCount, queueUsageCount] = await Promise.all([
      this.bookingsRepository.count({ where: { serviceId: id } }),
      this.queueEntryRepository
        .createQueryBuilder('entry')
        .innerJoin('entry.services', 'service', 'service.id = :id', { id })
        .getCount(),
    ]);
    if (bookingCount > 0 || queueUsageCount > 0) {
      throw new BadRequestException(
        'This service has past bookings or queue visits and cannot be deleted - mark it inactive instead.',
      );
    }

    await this.servicesRepository.remove(service);
  }

  async findActiveByIdsForSalon(
    salonId: string,
    serviceIds: string[],
  ): Promise<Service[]> {
    const services = await this.servicesRepository.find({
      where: { id: In(serviceIds), salonId, isActive: true },
    });

    if (services.length !== serviceIds.length) {
      throw new BadRequestException(
        'One or more selected services are invalid or unavailable at this salon',
      );
    }

    return services;
  }
}
