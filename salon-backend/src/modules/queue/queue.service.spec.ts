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
import { SalonsService } from '../salons/salons.service';
import { ServicesService } from '../services/services.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/entities/user.entity';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

describe('QueueService', () => {
  let service: QueueService;
  let queueRepository: jest.Mocked<Repository<QueueEntry>>;
  let salonsService: jest.Mocked<SalonsService>;

  const salon = { id: 'salon-1', ownerId: 'owner-1' } as any;

  function makeEntry(overrides: Partial<QueueEntry> = {}): QueueEntry {
    return {
      id: 'entry-1',
      salonId: 'salon-1',
      customerId: 'customer-1',
      staffId: null,
      services: [{ durationMinutes: 30 } as any],
      tokenNumber: 1,
      status: QueueStatus.WAITING,
      joinedAt: new Date(),
      calledAt: null,
      completedAt: null,
      estimatedWaitMinutes: null,
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
      ],
    }).compile();

    service = module.get(QueueService);
    queueRepository = module.get(getRepositoryToken(QueueEntry));
    salonsService = module.get(SalonsService);
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
});
