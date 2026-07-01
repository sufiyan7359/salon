import {
  IsDateString,
  IsMilitaryTime,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class CreateBookingDto {
  @IsUUID()
  salonId!: string;

  @IsUUID()
  serviceId!: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsDateString()
  bookingDate!: string;

  @IsMilitaryTime()
  bookingTime!: string;
}
