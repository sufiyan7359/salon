import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { OtpService } from './otp.service';
import { OtpVerification } from './entities/otp-verification.entity';
import { SmsService } from '../../common/sms/sms.service';

function configWith(values: Record<string, string | undefined>) {
  return { get: jest.fn((key: string) => values[key]) };
}

async function buildService(
  config: Record<string, string | undefined>,
  repoOverrides: Partial<jest.Mocked<Repository<OtpVerification>>> = {},
) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      OtpService,
      {
        provide: getRepositoryToken(OtpVerification),
        useValue: {
          findOne: jest.fn().mockResolvedValue(null),
          create: jest.fn((v) => v),
          save: jest.fn((v) => Promise.resolve(v)),
          ...repoOverrides,
        },
      },
      { provide: ConfigService, useValue: configWith(config) },
      SmsService,
    ],
  }).compile();

  return module.get(OtpService);
}

describe('OtpService', () => {
  it('falls back to logging (stub) when OTP_PROVIDER is unset', async () => {
    const service = await buildService({});
    const result = await service.requestOtp('+910000000000');
    expect(result.devOtp).toBeDefined();
  });

  it('falls back to stub when OTP_PROVIDER=twilio but credentials are incomplete', async () => {
    const service = await buildService({ OTP_PROVIDER: 'twilio' });
    // Should not throw even without Twilio credentials - falls back silently (with a warning log).
    const result = await service.requestOtp('+910000000000');
    expect(result.devOtp).toBeDefined();
  });

  it('omits devOtp once Twilio is actually live, regardless of NODE_ENV', async () => {
    const service = await buildService({
      NODE_ENV: 'development',
      OTP_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      TWILIO_AUTH_TOKEN: 'authtokenfake',
      TWILIO_FROM_NUMBER: '+15005550006',
    });
    const smsService = (service as unknown as { smsService: SmsService })
      .smsService;
    jest.spyOn(smsService, 'send').mockResolvedValue();

    const result = await service.requestOtp('+910000000000');
    expect(result.devOtp).toBeUndefined();
  });

  it('rejects verification for an unknown or expired code', async () => {
    const service = await buildService(
      {},
      { findOne: jest.fn().mockResolvedValue(null) },
    );
    await expect(service.verifyOtp('+910000000000', '000000')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('enforces the resend cooldown', async () => {
    const service = await buildService(
      {},
      {
        findOne: jest.fn().mockResolvedValue({
          phoneNumber: '+910000000000',
          otpCode: '123456',
          createdAt: new Date(),
          isVerified: false,
        } as any),
      },
    );

    await expect(service.requestOtp('+910000000000')).rejects.toThrow(
      BadRequestException,
    );
  });
});
