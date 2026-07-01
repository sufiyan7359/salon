import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Twilio } from 'twilio';
import { OtpVerification } from './entities/otp-verification.entity';

const RESEND_COOLDOWN_SECONDS = 60;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly twilioClient: Twilio | null;
  private readonly twilioFromNumber: string | undefined;

  constructor(
    @InjectRepository(OtpVerification)
    private readonly otpRepository: Repository<OtpVerification>,
    private readonly configService: ConfigService,
  ) {
    const provider = this.configService.get<string>('OTP_PROVIDER') ?? 'stub';
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.twilioFromNumber =
      this.configService.get<string>('TWILIO_FROM_NUMBER');

    if (
      provider === 'twilio' &&
      accountSid &&
      authToken &&
      this.twilioFromNumber
    ) {
      this.twilioClient = new Twilio(accountSid, authToken);
      this.logger.log('OTP delivery: Twilio SMS enabled');
    } else {
      this.twilioClient = null;
      if (provider === 'twilio') {
        this.logger.warn(
          'OTP_PROVIDER is "twilio" but TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER ' +
            'are not all set - falling back to logging OTP codes to the console instead of sending real SMS.',
        );
      }
    }
  }

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
    if (!this.twilioClient) {
      this.logger.log(`OTP for ${phoneNumber}: ${otpCode}`);
      return;
    }

    try {
      await this.twilioClient.messages.create({
        body: `Your Glow Salon verification code is ${otpCode}. It expires in ${this.expiresInMinutes} minutes.`,
        from: this.twilioFromNumber,
        to: phoneNumber,
      });
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
