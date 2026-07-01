import { IsPhoneNumber } from 'class-validator';

export class SendOtpDto {
  @IsPhoneNumber(undefined, {
    message: 'phoneNumber must be a valid phone number in E.164 format',
  })
  phoneNumber!: string;
}
