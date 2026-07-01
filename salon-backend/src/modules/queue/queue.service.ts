import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { QueueEntry, QueueStatus } from './entities/queue-entry.entity';
import { JoinQueueDto } from './dto/join-queue.dto';
import { WalkInQueueDto } from './dto/walk-in-queue.dto';
import { CallNextDto } from './dto/call-next.dto';
import { SalonsService } from '../salons/salons.service';
import { ServicesService } from '../services/services.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/entities/user.entity';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

const DEFAULT_AVG_DURATION_MINUTES = 15;
const ACTIVE_STATUSES = [
  QueueStatus.WAITING,
  QueueStatus.NEXT,
  QueueStatus.IN_SERVICE,
];

export interface QueueEntryWithPosition extends QueueEntry {
  position: number;
  peopleAhead: number;
}

@Injectable()
export class QueueService {
  constructor(
    @InjectRepository(QueueEntry)
    private readonly queueRepository: Repository<QueueEntry>,
    private readonly salonsService: SalonsService,
    private readonly servicesService: ServicesService,
    private readonly usersService: UsersService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async join(customerId: string, dto: JoinQueueDto): Promise<QueueEntry> {
    await this.salonsService.findByIdOrThrow(dto.salonId);
    const services = await this.servicesService.findActiveByIdsForSalon(
      dto.salonId,
      dto.serviceIds,
    );

    const tokenNumber = await this.nextTokenNumber(dto.salonId);

    const entry = this.queueRepository.create({
      salonId: dto.salonId,
      customerId,
      staffId: dto.staffId ?? null,
      services,
      tokenNumber,
      status: QueueStatus.WAITING,
    });

    const saved = await this.queueRepository.save(entry);
    this.emitQueueUpdated(dto.salonId);
    return this.findByIdOrThrow(saved.id);
  }

  async walkIn(ownerId: string, dto: WalkInQueueDto, salonId: string) {
    const salon = await this.salonsService.findByIdOrThrow(salonId);
    this.salonsService.assertOwnership(salon, ownerId);

    let customer = await this.usersService.findByPhoneNumber(dto.customerPhone);
    if (!customer) {
      customer = await this.usersService.createCustomer(
        dto.customerPhone,
        dto.customerName,
      );
    }

    return this.join(customer.id, {
      salonId,
      serviceIds: dto.serviceIds,
      staffId: dto.staffId,
    });
  }

  async getLiveQueue(salonId: string): Promise<QueueEntryWithPosition[]> {
    await this.salonsService.findByIdOrThrow(salonId);
    const entries = await this.queueRepository.find({
      where: { salonId, status: In(ACTIVE_STATUSES) },
      relations: { services: true, staff: true, customer: true },
      order: { joinedAt: 'ASC' },
    });

    return this.annotate(entries);
  }

  async getStatus(
    entryId: string,
    requester: AuthenticatedUser,
  ): Promise<QueueEntryWithPosition> {
    const entry = await this.findByIdOrThrow(entryId);
    await this.assertCanView(entry, requester);

    const active = await this.queueRepository.find({
      where: { salonId: entry.salonId, status: In(ACTIVE_STATUSES) },
      relations: { services: true, staff: true, customer: true },
      order: { joinedAt: 'ASC' },
    });

    const annotated = this.annotate(active);
    const match = annotated.find((item) => item.id === entryId);
    return match ?? { ...entry, position: 0, peopleAhead: 0 };
  }

  async callNext(
    id: string,
    ownerId: string,
    dto: CallNextDto,
  ): Promise<QueueEntry> {
    const entry = await this.findByIdOrThrow(id);
    await this.assertOwnerManages(entry, ownerId);

    if (
      entry.status !== QueueStatus.WAITING &&
      entry.status !== QueueStatus.NEXT
    ) {
      throw new BadRequestException(
        'Only a waiting customer can be called next',
      );
    }

    entry.status = QueueStatus.IN_SERVICE;
    entry.calledAt = new Date();
    if (dto.staffId) {
      entry.staffId = dto.staffId;
    }

    const saved = await this.queueRepository.save(entry);
    this.emitQueueUpdated(entry.salonId);
    return saved;
  }

  async complete(id: string, ownerId: string): Promise<QueueEntry> {
    const entry = await this.findByIdOrThrow(id);
    await this.assertOwnerManages(entry, ownerId);

    if (entry.status !== QueueStatus.IN_SERVICE) {
      throw new BadRequestException(
        'Only a customer currently in service can be marked completed',
      );
    }

    entry.status = QueueStatus.COMPLETED;
    entry.completedAt = new Date();

    const saved = await this.queueRepository.save(entry);
    this.emitQueueUpdated(entry.salonId);
    return saved;
  }

  async noShow(id: string, ownerId: string): Promise<QueueEntry> {
    const entry = await this.findByIdOrThrow(id);
    await this.assertOwnerManages(entry, ownerId);

    if (
      entry.status === QueueStatus.COMPLETED ||
      entry.status === QueueStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'This entry is already finalized and cannot be marked no-show',
      );
    }

    entry.status = QueueStatus.NO_SHOW;

    const saved = await this.queueRepository.save(entry);
    this.emitQueueUpdated(entry.salonId);
    return saved;
  }

  async leave(id: string, requester: AuthenticatedUser): Promise<QueueEntry> {
    const entry = await this.findByIdOrThrow(id);

    const isOwningCustomer = entry.customerId === requester.userId;
    if (!isOwningCustomer) {
      const salon = await this.salonsService.findByIdOrThrow(entry.salonId);
      if (
        requester.role !== UserRole.OWNER ||
        salon.ownerId !== requester.userId
      ) {
        throw new ForbiddenException('You cannot modify this queue entry');
      }
    }

    if (
      entry.status === QueueStatus.COMPLETED ||
      entry.status === QueueStatus.CANCELLED
    ) {
      throw new BadRequestException('This entry has already been finalized');
    }

    entry.status = QueueStatus.CANCELLED;

    const saved = await this.queueRepository.save(entry);
    this.emitQueueUpdated(entry.salonId);
    return saved;
  }

  private async findByIdOrThrow(id: string): Promise<QueueEntry> {
    const entry = await this.queueRepository.findOne({
      where: { id },
      relations: { services: true, staff: true, customer: true },
    });
    if (!entry) {
      throw new NotFoundException('Queue entry not found');
    }
    return entry;
  }

  private async assertOwnerManages(
    entry: QueueEntry,
    ownerId: string,
  ): Promise<void> {
    const salon = await this.salonsService.findByIdOrThrow(entry.salonId);
    this.salonsService.assertOwnership(salon, ownerId);
  }

  private async assertCanView(
    entry: QueueEntry,
    requester: AuthenticatedUser,
  ): Promise<void> {
    if (entry.customerId === requester.userId) {
      return;
    }
    const salon = await this.salonsService.findByIdOrThrow(entry.salonId);
    if (
      requester.role !== UserRole.OWNER ||
      salon.ownerId !== requester.userId
    ) {
      throw new ForbiddenException('You cannot view this queue entry');
    }
  }

  private async nextTokenNumber(salonId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const countToday = await this.queueRepository.count({
      where: { salonId, joinedAt: MoreThanOrEqual(startOfDay) },
    });

    return countToday + 1;
  }

  private annotate(entries: QueueEntry[]): QueueEntryWithPosition[] {
    const durations = entries.map((entry) =>
      entry.services.reduce((sum, service) => sum + service.durationMinutes, 0),
    );
    const avgDuration =
      durations.length > 0
        ? durations.reduce((sum, d) => sum + d, 0) / durations.length
        : DEFAULT_AVG_DURATION_MINUTES;

    return entries.map((entry, index) => ({
      ...entry,
      position: index + 1,
      peopleAhead: index,
      estimatedWaitMinutes: Math.round(
        index * (avgDuration || DEFAULT_AVG_DURATION_MINUTES),
      ),
    }));
  }

  private emitQueueUpdated(salonId: string): void {
    this.eventEmitter.emit('queue.updated', { salonId });
  }
}
