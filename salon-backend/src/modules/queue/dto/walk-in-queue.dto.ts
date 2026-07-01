import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class WalkInQueueDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  serviceIds!: string[];

  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsString()
  @MinLength(2)
  customerName!: string;

  @IsPhoneNumber(undefined, {
    message: 'customerPhone must be a valid phone number in E.164 format',
  })
  customerPhone!: string;
}
