import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { ServicesService } from './services.service';
import { Service } from './entities/service.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { QueueEntry } from '../queue/entities/queue-entry.entity';
import { SalonsService } from '../salons/salons.service';

describe('ServicesService', () => {
  let service: ServicesService;
  let servicesRepository: jest.Mocked<Repository<Service>>;
  let bookingsRepository: jest.Mocked<Repository<Booking>>;
  let queueEntryQueryBuilder: { innerJoin: jest.Mock; getCount: jest.Mock };

  const salon = { id: 'salon-1', ownerId: 'owner-1' } as any;
  const theService = { id: 'service-1', salonId: 'salon-1' } as Service;

  beforeEach(async () => {
    queueEntryQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServicesService,
        {
          provide: getRepositoryToken(Service),
          useValue: {
            findOne: jest.fn().mockResolvedValue(theService),
            remove: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getRepositoryToken(Booking),
          useValue: { count: jest.fn().mockResolvedValue(0) },
        },
        {
          provide: getRepositoryToken(QueueEntry),
          useValue: {
            createQueryBuilder: jest.fn(() => queueEntryQueryBuilder),
          },
        },
        {
          provide: SalonsService,
          useValue: {
            findByIdOrThrow: jest.fn().mockResolvedValue(salon),
            assertOwnership: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(ServicesService);
    servicesRepository = module.get(getRepositoryToken(Service));
    bookingsRepository = module.get(getRepositoryToken(Booking));
  });

  it('deletes a service that has never been booked or queued', async () => {
    await service.remove('service-1', 'owner-1');
    expect(servicesRepository.remove).toHaveBeenCalledWith(theService);
  });

  it('rejects deleting a service with past bookings', async () => {
    (bookingsRepository.count as jest.Mock).mockResolvedValue(2);

    await expect(service.remove('service-1', 'owner-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(servicesRepository.remove).not.toHaveBeenCalled();
  });

  it('rejects deleting a service with past queue visits', async () => {
    queueEntryQueryBuilder.getCount.mockResolvedValue(1);

    await expect(service.remove('service-1', 'owner-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(servicesRepository.remove).not.toHaveBeenCalled();
  });
});
