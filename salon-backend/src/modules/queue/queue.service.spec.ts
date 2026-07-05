import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { QueueService } from './queue.service';
import { QueueEntry, QueueStatus } from './entities/queue-entry.entity';
import { Salon } from '../salons/entities/salon.entity';
import { SalonsService } from '../salons/salons.service';
import { ServicesService } from '../services/services.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/entities/user.entity';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { SmsService } from '../../common/sms/sms.service';

describe('QueueService', () => {
  let service: QueueService;
  let queueRepository: jest.Mocked<Repository<QueueEntry>>;
  let salonsService: jest.Mocked<SalonsService>;
  let smsService: jest.Mocked<SmsService>;
  let servicesService: jest.Mocked<ServicesService>;

  const salon = {
    id: 'salon-1',
    ownerId: 'owner-1',
    name: 'Glow Salon',
  } as any;

  function makeEntry(overrides: Partial<QueueEntry> = {}): QueueEntry {
    return {
      id: 'entry-1',
      salonId: 'salon-1',
      customerId: 'customer-1',
      customer: { phoneNumber: '+910000000001' } as any,
      staffId: null,
      services: [{ durationMinutes: 30 } as any],
      tokenNumber: 1,
      status: QueueStatus.WAITING,
      joinedAt: new Date(),
      calledAt: null,
      completedAt: null,
      estimatedWaitMinutes: null,
      reminderSentAt: null,
      ...overrides,
    } as QueueEntry;
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        {
          provide: getRepositoryToken(QueueEntry),
          useValue: {
            create: jest.fn((v) => v),
            save: jest.fn((v) => Promise.resolve(v)),
            find: jest.fn(),
            findOne: jest.fn(),
            count: jest.fn(),
            update: jest.fn().mockResolvedValue(undefined),
            createQueryBuilder: jest.fn(),
            // join() runs inside manager.transaction() to lock the Salon row
            // for the duration of the duplicate-check + token-count + insert.
            // The fake manager forwards everything except the Salon lock
            // itself back to this same repository mock, so existing
            // `queueRepository.findOne`/`.count`/`.save` assertions keep
            // working unchanged.
            get manager() {
              return {
                transaction: (cb: (manager: unknown) => unknown) =>
                  cb({
                    findOne: (entity: unknown, opts: unknown) =>
                      entity === Salon
                        ? Promise.resolve({ id: 'salon-1' })
                        : (this.findOne as jest.Mock)(opts),
                    count: (_entity: unknown, opts: unknown) =>
                      (this.count as jest.Mock)(opts),
                    create: (_entity: unknown, data: unknown) =>
                      (this.create as jest.Mock)(data),
                    save: (data: unknown) => (this.save as jest.Mock)(data),
                  }),
              };
            },
          },
        },
        {
          provide: SalonsService,
          useValue: {
            findByIdOrThrow: jest.fn().mockResolvedValue(salon),
            assertOwnership: jest.fn((s, ownerId) => {
              if (s.ownerId !== ownerId) throw new ForbiddenException();
            }),
          },
        },
        {
          provide: ServicesService,
          useValue: { findActiveByIdsForSalon: jest.fn() },
        },
        { provide: UsersService, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: SmsService,
          useValue: { send: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(QueueService);
    queueRepository = module.get(getRepositoryToken(QueueEntry));
    salonsService = module.get(SalonsService);
    smsService = module.get(SmsService);
    servicesService = module.get(ServicesService);
  });

  describe('callNext', () => {
    it('moves a waiting entry to in_service and stamps calledAt', async () => {
      const entry = makeEntry({ status: QueueStatus.WAITING });
      queueRepository.findOne.mockResolvedValue(entry);

      const result = await service.callNext('entry-1', 'owner-1', {});

      expect(result.status).toBe(QueueStatus.IN_SERVICE);
      expect(result.calledAt).toBeInstanceOf(Date);
    });

    it('rejects calling an entry that is already in service', async () => {
      const entry = makeEntry({ status: QueueStatus.IN_SERVICE });
      queueRepository.findOne.mockResolvedValue(entry);

      await expect(service.callNext('entry-1', 'owner-1', {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when the requester does not own the salon', async () => {
      const entry = makeEntry({ status: QueueStatus.WAITING });
      queueRepository.findOne.mockResolvedValue(entry);

      await expect(
        service.callNext('entry-1', 'someone-else', {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException for a missing entry', async () => {
      queueRepository.findOne.mockResolvedValue(null);

      await expect(service.callNext('missing', 'owner-1', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('complete', () => {
    it('only completes an entry that is currently in service', async () => {
      const entry = makeEntry({ status: QueueStatus.WAITING });
      queueRepository.findOne.mockResolvedValue(entry);

      await expect(service.complete('entry-1', 'owner-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('marks an in-service entry completed and stamps completedAt', async () => {
      const entry = makeEntry({ status: QueueStatus.IN_SERVICE });
      queueRepository.findOne.mockResolvedValue(entry);

      const result = await service.complete('entry-1', 'owner-1');

      expect(result.status).toBe(QueueStatus.COMPLETED);
      expect(result.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('noShow', () => {
    it('rejects marking an already-completed entry as no-show', async () => {
      const entry = makeEntry({ status: QueueStatus.COMPLETED });
      queueRepository.findOne.mockResolvedValue(entry);

      await expect(service.noShow('entry-1', 'owner-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('marks a waiting entry as no-show', async () => {
      const entry = makeEntry({ status: QueueStatus.WAITING });
      queueRepository.findOne.mockResolvedValue(entry);

      const result = await service.noShow('entry-1', 'owner-1');
      expect(result.status).toBe(QueueStatus.NO_SHOW);
    });
  });

  describe('leave', () => {
    const customerRequester: AuthenticatedUser = {
      userId: 'customer-1',
      role: UserRole.CUSTOMER,
      phoneNumber: null,
      email: null,
    };
    const ownerRequester: AuthenticatedUser = {
      userId: 'owner-1',
      role: UserRole.OWNER,
      phoneNumber: null,
      email: null,
    };
    const strangerRequester: AuthenticatedUser = {
      userId: 'stranger',
      role: UserRole.CUSTOMER,
      phoneNumber: null,
      email: null,
    };

    it('allows the owning customer to cancel their own entry', async () => {
      const entry = makeEntry({ status: QueueStatus.WAITING });
      queueRepository.findOne.mockResolvedValue(entry);

      const result = await service.leave('entry-1', customerRequester);
      expect(result.status).toBe(QueueStatus.CANCELLED);
    });

    it('allows the salon owner to remove any entry', async () => {
      const entry = makeEntry({ status: QueueStatus.WAITING });
      queueRepository.findOne.mockResolvedValue(entry);

      const result = await service.leave('entry-1', ownerRequester);
      expect(result.status).toBe(QueueStatus.CANCELLED);
    });

    it("rejects a stranger trying to cancel someone else's entry", async () => {
      const entry = makeEntry({ status: QueueStatus.WAITING });
      queueRepository.findOne.mockResolvedValue(entry);

      await expect(service.leave('entry-1', strangerRequester)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects leaving an already-completed entry', async () => {
      const entry = makeEntry({ status: QueueStatus.COMPLETED });
      queueRepository.findOne.mockResolvedValue(entry);

      await expect(service.leave('entry-1', customerRequester)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getLiveQueue position/wait calculation', () => {
    it('assigns sequential positions and scales estimated wait by average service duration', async () => {
      const entries = [
        makeEntry({ id: 'e1', services: [{ durationMinutes: 20 } as any] }),
        makeEntry({ id: 'e2', services: [{ durationMinutes: 40 } as any] }),
        makeEntry({ id: 'e3', services: [{ durationMinutes: 30 } as any] }),
      ];
      queueRepository.find.mockResolvedValue(entries);

      const result = await service.getLiveQueue('salon-1');

      expect(result.map((r) => r.position)).toEqual([1, 2, 3]);
      expect(result.map((r) => r.peopleAhead)).toEqual([0, 1, 2]);
      // avg duration = (20+40+30)/3 = 30
      expect(result[0].estimatedWaitMinutes).toBe(0);
      expect(result[1].estimatedWaitMinutes).toBe(30);
      expect(result[2].estimatedWaitMinutes).toBe(60);
    });

    it('returns an empty list with no error when the salon has no active entries', async () => {
      queueRepository.find.mockResolvedValue([]);
      const result = await service.getLiveQueue('salon-1');
      expect(result).toEqual([]);
    });
  });

  describe('join', () => {
    it('creates a new entry when the customer has no active entry yet', async () => {
      const services = [{ id: 's1', durationMinutes: 20 } as any];
      servicesService.findActiveByIdsForSalon.mockResolvedValue(services);
      // findOne is used twice: the pre-create duplicate check, then
      // findByIdOrThrow re-fetching the saved entry with relations.
      queueRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeEntry({ services }));
      queueRepository.count.mockResolvedValue(2);

      const result = await service.join('customer-1', {
        salonId: 'salon-1',
        serviceIds: ['s1'],
      });

      expect(queueRepository.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('rejects with a ConflictException carrying the existing entryId when the customer is already active', async () => {
      const existing = makeEntry({ id: 'entry-existing', tokenNumber: 7 });
      servicesService.findActiveByIdsForSalon.mockResolvedValue([
        { id: 's1', durationMinutes: 20 } as any,
      ]);
      queueRepository.findOne.mockResolvedValue(existing);

      await expect(
        service.join('customer-1', { salonId: 'salon-1', serviceIds: ['s1'] }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          entryId: 'entry-existing',
          tokenNumber: 7,
        }),
      });
      expect(queueRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('walkIn', () => {
    it('rejects when the requester does not own the salon', async () => {
      salonsService.findByIdOrThrow.mockResolvedValue(salon);

      await expect(
        service.walkIn(
          'not-the-owner',
          {
            customerName: 'Walk In',
            customerPhone: '+910000000000',
            serviceIds: ['s1'],
          },
          'salon-1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('sendUpcomingTurnReminders', () => {
    function mockCandidateSalons(salonIds: string[]): void {
      queueRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue(salonIds.map((salonId) => ({ salonId }))),
      } as any);
    }

    it('texts and marks entries whose estimated wait has dropped to the threshold', async () => {
      mockCandidateSalons(['salon-1']);
      const entry = makeEntry({
        id: 'e1',
        status: QueueStatus.WAITING,
        services: [{ durationMinutes: 5 } as any],
      });
      queueRepository.find.mockResolvedValue([entry]);

      await service.sendUpcomingTurnReminders();

      expect(smsService.send).toHaveBeenCalledWith(
        '+910000000001',
        expect.stringContaining('Glow Salon'),
      );
      expect(queueRepository.update).toHaveBeenCalledWith('e1', {
        reminderSentAt: expect.any(Date),
      });
    });

    it('does not text an entry whose estimated wait is still above the threshold', async () => {
      mockCandidateSalons(['salon-1']);
      const near = makeEntry({
        id: 'e1',
        services: [{ durationMinutes: 5 } as any],
      });
      const far = makeEntry({
        id: 'e2',
        services: [{ durationMinutes: 60 } as any],
      });
      queueRepository.find.mockResolvedValue([near, far]);

      await service.sendUpcomingTurnReminders();

      expect(smsService.send).toHaveBeenCalledTimes(1);
      expect(smsService.send).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('e2'),
      );
    });

    it('does not re-text an entry that already has a reminder sent', async () => {
      mockCandidateSalons(['salon-1']);
      const entry = makeEntry({
        id: 'e1',
        services: [{ durationMinutes: 5 } as any],
        reminderSentAt: new Date(),
      });
      queueRepository.find.mockResolvedValue([entry]);

      await service.sendUpcomingTurnReminders();

      expect(smsService.send).not.toHaveBeenCalled();
    });

    it('skips entries with no phone number on file instead of throwing', async () => {
      mockCandidateSalons(['salon-1']);
      const entry = makeEntry({
        id: 'e1',
        services: [{ durationMinutes: 5 } as any],
        customer: { phoneNumber: null } as any,
      });
      queueRepository.find.mockResolvedValue([entry]);

      await expect(
        service.sendUpcomingTurnReminders(),
      ).resolves.toBeUndefined();
      expect(smsService.send).not.toHaveBeenCalled();
    });

    it('does nothing when no salons have due candidates', async () => {
      mockCandidateSalons([]);

      await service.sendUpcomingTurnReminders();

      expect(queueRepository.find).not.toHaveBeenCalled();
      expect(smsService.send).not.toHaveBeenCalled();
    });
  });
});
