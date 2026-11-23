import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Salon } from './entities/salon.entity';
import { CreateSalonDto } from './dto/create-salon.dto';
import { UpdateSalonDto } from './dto/update-salon.dto';

@Injectable()
export class SalonsService {
  constructor(
    @InjectRepository(Salon)
    private readonly salonsRepository: Repository<Salon>,
  ) {}

  findAll() {
    return this.salonsRepository.find();
  }

  async findByIdOrThrow(id: string): Promise<Salon> {
    const salon = await this.salonsRepository.findOne({ where: { id } });
    if (!salon) {
      throw new NotFoundException('Salon not found');
    }
    return salon;
  }

  async create(ownerId: string, dto: CreateSalonDto): Promise<Salon> {
    const existing = await this.salonsRepository.count();
    if (existing > 0) {
      throw new ConflictException(
        'A salon already exists. This app is configured for single-salon mode.',
      );
    }

    const salon = this.salonsRepository.create({ ...dto, ownerId });
    return this.salonsRepository.save(salon);
  }

  async update(
    id: string,
    ownerId: string,
    dto: UpdateSalonDto,
  ): Promise<Salon> {
    const salon = await this.findByIdOrThrow(id);
    this.assertOwnership(salon, ownerId);
    Object.assign(salon, dto);
    return this.salonsRepository.save(salon);
  }

  assertOwnership(salon: Salon, ownerId: string): void {
    if (salon.ownerId !== ownerId) {
      throw new ForbiddenException('You do not manage this salon');
    }
  }
}
