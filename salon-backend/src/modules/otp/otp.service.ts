import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { OtpVerification } from './entities/otp-verification.entity';
import { SmsService } from '../../common/sms/sms.service';

const RESEND_COOLDOWN_SECONDS = 60;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @InjectRepository(OtpVerification)
    private readonly otpRepository: Repository<OtpVerification>,
    private readonly configService: ConfigService,
    private readonly smsService: SmsService,
  ) {}

  private get otpLength(): number {
    return parseInt(this.configService.get('OTP_LENGTH') ?? '6', 10);
  }

  private get expiresInMinutes(): number {
    return parseInt(
      this.configService.get('OTP_EXPIRES_IN_MINUTES') ?? '5',
      10,
    );
  }

  async requestOtp(
    phoneNumber: string,
  ): Promise<{ expiresInMinutes: number; devOtp?: string }> {
    const cooldownStart = new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000);
    const recent = await this.otpRepository.findOne({
      where: { phoneNumber, createdAt: MoreThan(cooldownStart) },
      order: { createdAt: 'DESC' },
    });

    if (recent) {
      throw new BadRequestException(
        `Please wait before requesting another OTP for this number.`,
      );
    }

    const otpCode = this.generateOtpCode();
    const expiresAt = new Date(Date.now() + this.expiresInMinutes * 60 * 1000);

    await this.otpRepository.save(
      this.otpRepository.create({ phoneNumber, otpCode, expiresAt }),
    );

    await this.deliverOtp(phoneNumber, otpCode);

    const isDev = this.configService.get('NODE_ENV') !== 'production';
    return {
      expiresInMinutes: this.expiresInMinutes,
      ...(isDev ? { devOtp: otpCode } : {}),
    };
  }

  async verifyOtp(phoneNumber: string, otpCode: string): Promise<void> {
    const entry = await this.otpRepository.findOne({
      where: { phoneNumber, otpCode, isVerified: false },
      order: { createdAt: 'DESC' },
    });

    if (!entry || entry.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    entry.isVerified = true;
    await this.otpRepository.save(entry);
  }

  private generateOtpCode(): string {
    const max = 10 ** this.otpLength;
    const code = Math.floor(Math.random() * max)
      .toString()
      .padStart(this.otpLength, '0');
    return code;
  }

  private async deliverOtp(
    phoneNumber: string,
    otpCode: string,
  ): Promise<void> {
    try {
      await this.smsService.send(
        phoneNumber,
        `Your Shadab Yaseen Hair Salon verification code is ${otpCode}. It expires in ${this.expiresInMinutes} minutes.`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send OTP SMS to ${phoneNumber}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new BadRequestException(
        'Failed to send the OTP SMS. Please check the phone number and try again.',
      );
    }
  }
}
