import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueEntry } from './entities/queue-entry.entity';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { QueueGateway } from './queue.gateway';
import { SalonsModule } from '../salons/salons.module';
import { ServicesModule } from '../services/services.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([QueueEntry]),
    SalonsModule,
    ServicesModule,
    UsersModule,
  ],
  controllers: [QueueController],
  providers: [QueueService, QueueGateway],
})
export class QueueModule {}
