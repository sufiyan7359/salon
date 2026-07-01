import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { OtpService } from '../otp/otp.service';
import { UserRole } from '../users/entities/user.entity';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let otpService: jest.Mocked<OtpService>;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByPhoneNumber: jest.fn(),
            createCustomer: jest.fn(),
            countByRole: jest.fn(),
            findByEmailWithPassword: jest.fn(),
            createOwner: jest.fn(),
            findById: jest.fn(),
          },
        },
        {
          provide: OtpService,
          useValue: { requestOtp: jest.fn(), verifyOtp: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('signed-token'),
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => 'test-value') },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    usersService = module.get(UsersService);
    otpService = module.get(OtpService);
    jwtService = module.get(JwtService);
  });

  describe('verifyOtpAndLogin', () => {
    it('creates a new customer on first-time verification', async () => {
      otpService.verifyOtp.mockResolvedValue(undefined);
      usersService.findByPhoneNumber.mockResolvedValue(null);
      usersService.createCustomer.mockResolvedValue({
        id: 'u1',
        name: 'New Customer',
        role: UserRole.CUSTOMER,
        phoneNumber: '+910000000000',
        email: null,
      } as any);

      const result = await service.verifyOtpAndLogin({
        phoneNumber: '+910000000000',
        otpCode: '123456',
        name: 'New Customer',
      });

      expect(usersService.createCustomer).toHaveBeenCalledWith(
        '+910000000000',
        'New Customer',
      );
      expect(result.user.role).toBe(UserRole.CUSTOMER);
      expect(result.accessToken).toBe('signed-token');
    });

    it('reuses an existing customer instead of creating a duplicate', async () => {
      otpService.verifyOtp.mockResolvedValue(undefined);
      usersService.findByPhoneNumber.mockResolvedValue({
        id: 'existing-1',
        name: 'Existing',
        role: UserRole.CUSTOMER,
        phoneNumber: '+910000000000',
        email: null,
      } as any);

      const result = await service.verifyOtpAndLogin({
        phoneNumber: '+910000000000',
        otpCode: '123456',
      });

      expect(usersService.createCustomer).not.toHaveBeenCalled();
      expect(result.user.id).toBe('existing-1');
    });

    it('propagates an invalid OTP rejection without creating a user', async () => {
      otpService.verifyOtp.mockRejectedValue(
        new UnauthorizedException('Invalid or expired OTP'),
      );

      await expect(
        service.verifyOtpAndLogin({
          phoneNumber: '+910000000000',
          otpCode: '000000',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(usersService.findByPhoneNumber).not.toHaveBeenCalled();
    });
  });

  describe('registerOwner', () => {
    it('blocks registration once an owner already exists (single-salon mode)', async () => {
      usersService.countByRole.mockResolvedValue(1);

      await expect(
        service.registerOwner({
          name: 'Second Owner',
          email: 'a@b.com',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
      expect(usersService.createOwner).not.toHaveBeenCalled();
    });

    it('blocks registration with an already-registered email', async () => {
      usersService.countByRole.mockResolvedValue(0);
      usersService.findByEmailWithPassword.mockResolvedValue({
        id: 'x',
      } as any);

      await expect(
        service.registerOwner({
          name: 'Owner',
          email: 'taken@b.com',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('hashes the password before storing a new owner', async () => {
      usersService.countByRole.mockResolvedValue(0);
      usersService.findByEmailWithPassword.mockResolvedValue(null);
      usersService.createOwner.mockImplementation((email, name, passwordHash) =>
        Promise.resolve({
          id: 'owner-1',
          name,
          role: UserRole.OWNER,
          phoneNumber: null,
          email,
          passwordHash,
        } as any),
      );

      await service.registerOwner({
        name: 'Owner',
        email: 'owner@b.com',
        password: 'plaintext-password',
      });

      const [, , storedHash] = usersService.createOwner.mock.calls[0];
      expect(storedHash).not.toBe('plaintext-password');
      expect(await bcrypt.compare('plaintext-password', storedHash)).toBe(true);
    });
  });

  describe('ownerLogin', () => {
    it('rejects an unknown email', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(null);

      await expect(
        service.ownerLogin({ email: 'nobody@b.com', password: 'whatever1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an incorrect password', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      usersService.findByEmailWithPassword.mockResolvedValue({
        id: 'owner-1',
        role: UserRole.OWNER,
        passwordHash,
        name: 'Owner',
        phoneNumber: null,
        email: 'owner@b.com',
      } as any);

      await expect(
        service.ownerLogin({
          email: 'owner@b.com',
          password: 'wrong-password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('logs in with the correct password', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      usersService.findByEmailWithPassword.mockResolvedValue({
        id: 'owner-1',
        role: UserRole.OWNER,
        passwordHash,
        name: 'Owner',
        phoneNumber: null,
        email: 'owner@b.com',
      } as any);

      const result = await service.ownerLogin({
        email: 'owner@b.com',
        password: 'correct-password',
      });
      expect(result.user.id).toBe('owner-1');
    });
  });

  describe('refreshTokens', () => {
    it('rejects an invalid/expired refresh token', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('bad token'));

      await expect(service.refreshTokens('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a refresh token for a user that no longer exists', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'ghost-user' });
      usersService.findById.mockResolvedValue(null);

      await expect(service.refreshTokens('token-for-ghost')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('issues fresh tokens for a valid refresh token', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'owner-1' });
      usersService.findById.mockResolvedValue({
        id: 'owner-1',
        role: UserRole.OWNER,
        phoneNumber: null,
        email: 'owner@b.com',
      } as any);

      const result = await service.refreshTokens('valid-token');
      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
    });
  });
});
