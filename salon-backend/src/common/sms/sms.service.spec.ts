import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SmsService } from './sms.service';

function configWith(values: Record<string, string | undefined>) {
  return { get: jest.fn((key: string) => values[key]) };
}

async function buildService(config: Record<string, string | undefined>) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      SmsService,
      { provide: ConfigService, useValue: configWith(config) },
    ],
  }).compile();

  return module.get(SmsService);
}

describe('SmsService', () => {
  it('is not live when OTP_PROVIDER is unset (stub mode)', async () => {
    const service = await buildService({});
    expect(service.isLive).toBe(false);
  });

  it('is not live when OTP_PROVIDER=twilio but credentials are incomplete', async () => {
    const service = await buildService({ OTP_PROVIDER: 'twilio' });
    expect(service.isLive).toBe(false);
  });

  it('is live when OTP_PROVIDER=twilio and all credentials are present', async () => {
    const service = await buildService({
      OTP_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'AC_test',
      TWILIO_AUTH_TOKEN: 'token_test',
      TWILIO_FROM_NUMBER: '+15550000000',
    });
    expect(service.isLive).toBe(true);
  });

  it('does not throw when sending in stub mode (just logs)', async () => {
    const service = await buildService({});
    await expect(
      service.send('+910000000000', 'hello'),
    ).resolves.toBeUndefined();
  });
});
