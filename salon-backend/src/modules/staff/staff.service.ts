import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Staff } from './entities/staff.entity';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { SalonsService } from '../salons/salons.service';

@Injectable()
export class StaffService {
  constructor(
    @InjectRepository(Staff)
    private readonly staffRepository: Repository<Staff>,
    private readonly salonsService: SalonsService,
  ) {}

  findBySalon(salonId: string) {
    return this.staffRepository.find({ where: { salonId } });
  }

  async findByIdOrThrow(id: string): Promise<Staff> {
    const staff = await this.staffRepository.findOne({ where: { id } });
    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }
    return staff;
  }

  async create(
    salonId: string,
    ownerId: string,
    dto: CreateStaffDto,
  ): Promise<Staff> {
    const salon = await this.salonsService.findByIdOrThrow(salonId);
    this.salonsService.assertOwnership(salon, ownerId);

    const staff = this.staffRepository.create({
      ...dto,
      salonId,
      userId: dto.userId ?? null,
    });
    return this.staffRepository.save(staff);
  }

  async update(
    id: string,
    ownerId: string,
    dto: UpdateStaffDto,
  ): Promise<Staff> {
    const staff = await this.findByIdOrThrow(id);
    const salon = await this.salonsService.findByIdOrThrow(staff.salonId);
    this.salonsService.assertOwnership(salon, ownerId);

    Object.assign(staff, dto);
    return this.staffRepository.save(staff);
  }

  async remove(id: string, ownerId: string): Promise<void> {
    const staff = await this.findByIdOrThrow(id);
    const salon = await this.salonsService.findByIdOrThrow(staff.salonId);
    this.salonsService.assertOwnership(salon, ownerId);

    await this.staffRepository.remove(staff);
  }
}
