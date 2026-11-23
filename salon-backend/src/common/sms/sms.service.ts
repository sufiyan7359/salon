import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';

// Shared by OtpService (verification codes) and QueueService (turn-coming-up
// reminders) so there's one place that knows how to reach Twilio and one
// fallback (log to console) when it isn't configured. OTP_PROVIDER doubles
// as the master switch for both - there's only one SMS channel in this app.
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly twilioClient: Twilio | null;
  private readonly fromNumber: string | undefined;

  constructor(private readonly configService: ConfigService) {
    const provider = this.configService.get<string>('OTP_PROVIDER') ?? 'stub';
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.fromNumber = this.configService.get<string>('TWILIO_FROM_NUMBER');

    if (provider === 'twilio' && accountSid && authToken && this.fromNumber) {
      this.twilioClient = new Twilio(accountSid, authToken);
      this.logger.log('SMS delivery: Twilio enabled');
    } else {
      this.twilioClient = null;
      if (provider === 'twilio') {
        this.logger.warn(
          'OTP_PROVIDER is "twilio" but TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER ' +
            'are not all set - falling back to logging SMS content to the console instead of sending real SMS.',
        );
      }
    }
  }

  get isLive(): boolean {
    return this.twilioClient !== null;
  }

  async send(to: string, body: string): Promise<void> {
    if (!this.twilioClient) {
      this.logger.log(`SMS to ${to}: ${body}`);
      return;
    }

    await this.twilioClient.messages.create({
      body,
      from: this.fromNumber,
      to,
    });
  }
}
