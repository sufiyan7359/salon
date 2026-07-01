import { IsOptional, IsPhoneNumber, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsPhoneNumber(undefined, {
    message: 'phoneNumber must be a valid phone number in E.164 format',
  })
  phoneNumber!: string;

  @IsString()
  @Length(4, 8)
  otpCode!: string;

  @IsOptional()
  @IsString()
  name?: string;
}
