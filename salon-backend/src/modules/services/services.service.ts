import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Service } from './entities/service.entity';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { SalonsService } from '../salons/salons.service';

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Service)
    private readonly servicesRepository: Repository<Service>,
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
