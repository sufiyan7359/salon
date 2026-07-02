import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
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
import { SmsService } from '../../common/sms/sms.service';

const DEFAULT_AVG_DURATION_MINUTES = 15;
const ACTIVE_STATUSES = [
  QueueStatus.WAITING,
  QueueStatus.NEXT,
  QueueStatus.IN_SERVICE,
];
const WAITING_STATUSES = [QueueStatus.WAITING, QueueStatus.NEXT];
const REMINDER_THRESHOLD_MINUTES = 10;
const REMINDER_CHECK_INTERVAL_MS = 60_000;

export interface QueueEntryWithPosition extends QueueEntry {
  position: number;
  peopleAhead: number;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectRepository(QueueEntry)
    private readonly queueRepository: Repository<QueueEntry>,
    private readonly salonsService: SalonsService,
    private readonly servicesService: ServicesService,
    private readonly usersService: UsersService,
    private readonly eventEmitter: EventEmitter2,
    private readonly smsService: SmsService,
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
    this.emitQueueUpdated(dto.salonId, saved.id);
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

  // Runs every minute rather than piggybacking on queue-change events, since
  // the estimated wait is purely positional (peopleAhead * avgDuration) and
  // doesn't shrink on its own as time passes - a customer can cross the
  // 10-minute threshold just by waiting, with no join/call-next/complete
  // event to trigger off of.
  @Interval(REMINDER_CHECK_INTERVAL_MS)
  async sendUpcomingTurnReminders(): Promise<void> {
    const candidates = await this.queueRepository
      .createQueryBuilder('entry')
      .select('DISTINCT entry.salonId', 'salonId')
      .where('entry.status IN (:...statuses)', { statuses: WAITING_STATUSES })
      .andWhere('entry.reminderSentAt IS NULL')
      .getRawMany<{ salonId: string }>();

    for (const { salonId } of candidates) {
      await this.sendUpcomingTurnRemindersForSalon(salonId);
    }
  }

  private async sendUpcomingTurnRemindersForSalon(
    salonId: string,
  ): Promise<void> {
    const activeQueue = await this.queueRepository.find({
      where: { salonId, status: In(ACTIVE_STATUSES) },
      relations: { services: true, staff: true, customer: true },
      order: { joinedAt: 'ASC' },
    });

    const due = this.annotate(activeQueue).filter(
      (entry) =>
        !entry.reminderSentAt &&
        WAITING_STATUSES.includes(entry.status) &&
        entry.estimatedWaitMinutes !== null &&
        entry.estimatedWaitMinutes <= REMINDER_THRESHOLD_MINUTES &&
        !!entry.customer?.phoneNumber,
    );
    if (due.length === 0) return;

    const salon = await this.salonsService.findByIdOrThrow(salonId);

    for (const entry of due) {
      if (!entry.customer.phoneNumber) continue;
      try {
        await this.smsService.send(
          entry.customer.phoneNumber,
          `Your turn at ${salon.name} is coming up in about ${entry.estimatedWaitMinutes} min. Please head to the salon now!`,
        );
        await this.queueRepository.update(entry.id, {
          reminderSentAt: new Date(),
        });
        this.eventEmitter.emit('queue.customer-arriving-soon', {
          salonId,
          entryId: entry.id,
          tokenNumber: entry.tokenNumber,
          customerName: entry.customer.name,
          estimatedWaitMinutes: entry.estimatedWaitMinutes,
        });
      } catch (error) {
        this.logger.error(
          `Failed to send turn-reminder SMS for queue entry ${entry.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
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
    this.emitQueueUpdated(entry.salonId, entry.id);
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
    this.emitQueueUpdated(entry.salonId, entry.id);
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
    this.emitQueueUpdated(entry.salonId, entry.id);
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
    this.emitQueueUpdated(entry.salonId, entry.id);
    return saved;
  }

  async getEntrySnapshot(id: string): Promise<QueueEntry> {
    return this.findByIdOrThrow(id);
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

  private emitQueueUpdated(salonId: string, entryId: string): void {
    this.eventEmitter.emit('queue.updated', { salonId, entryId });
  }
}
