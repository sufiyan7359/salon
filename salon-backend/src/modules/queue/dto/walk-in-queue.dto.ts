import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { normalizeIndianPhoneNumber } from '../../../common/utils/phone.util';

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

  @Transform(({ value }) => normalizeIndianPhoneNumber(value))
  @IsPhoneNumber('IN', {
    message: 'customerPhone must be a valid Indian mobile number',
  })
  customerPhone!: string;
}
