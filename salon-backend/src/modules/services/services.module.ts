import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Service } from './entities/service.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { QueueEntry } from '../queue/entities/queue-entry.entity';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';
import { SalonsModule } from '../salons/salons.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Service, Booking, QueueEntry]),
    SalonsModule,
  ],
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
