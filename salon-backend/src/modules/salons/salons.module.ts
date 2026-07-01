import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Salon } from './entities/salon.entity';
import { SalonsService } from './salons.service';
import { SalonsController } from './salons.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Salon])],
  controllers: [SalonsController],
  providers: [SalonsService],
  exports: [SalonsService],
})
export class SalonsModule {}
