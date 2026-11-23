import { ArrayMinSize, IsArray, IsOptional, IsUUID } from 'class-validator';

export class JoinQueueDto {
  @IsUUID()
  salonId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  serviceIds!: string[];

  @IsOptional()
  @IsUUID()
  staffId?: string;
}
