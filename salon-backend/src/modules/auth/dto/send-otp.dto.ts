import { Transform } from 'class-transformer';
import { IsPhoneNumber } from 'class-validator';
import { normalizeIndianPhoneNumber } from '../../../common/utils/phone.util';

export class SendOtpDto {
  @Transform(({ value }) => normalizeIndianPhoneNumber(value))
  @IsPhoneNumber('IN', {
    message: 'phoneNumber must be a valid Indian mobile number',
  })
  phoneNumber!: string;
}
