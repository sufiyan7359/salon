import { Transform } from 'class-transformer';
import { IsOptional, IsPhoneNumber, IsString, Length } from 'class-validator';
import { normalizeIndianPhoneNumber } from '../../../common/utils/phone.util';

export class VerifyOtpDto {
  @Transform(({ value }) => normalizeIndianPhoneNumber(value))
  @IsPhoneNumber('IN', {
    message: 'phoneNumber must be a valid Indian mobile number',
  })
  phoneNumber!: string;

  @IsString()
  @Length(4, 8)
  otpCode!: string;

  @IsOptional()
  @IsString()
  name?: string;
}
