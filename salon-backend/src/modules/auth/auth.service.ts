import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { OtpService } from '../otp/otp.service';
import { User, UserRole } from '../users/entities/user.entity';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { OwnerLoginDto } from './dto/owner-login.dto';
import { OwnerRegisterDto } from './dto/owner-register.dto';

const SALT_ROUNDS = 10;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PublicUser {
  id: string;
  name: string | null;
  role: UserRole;
  phoneNumber: string | null;
  email: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly otpService: OtpService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  sendOtp(dto: SendOtpDto) {
    return this.otpService.requestOtp(dto.phoneNumber);
  }

  async verifyOtpAndLogin(
    dto: VerifyOtpDto,
  ): Promise<AuthTokens & { user: PublicUser }> {
    await this.otpService.verifyOtp(dto.phoneNumber, dto.otpCode);

    let user = await this.usersService.findByPhoneNumber(dto.phoneNumber);
    if (!user) {
      user = await this.usersService.createCustomer(dto.phoneNumber, dto.name);
    }

    return { ...(await this.issueTokens(user)), user: this.toPublicUser(user) };
  }

  async registerOwner(
    dto: OwnerRegisterDto,
  ): Promise<AuthTokens & { user: PublicUser }> {
    const existingOwners = await this.usersService.countByRole(UserRole.OWNER);
    if (existingOwners > 0) {
      throw new ConflictException(
        'An owner account already exists for this salon.',
      );
    }

    const existingEmail = await this.usersService.findByEmailWithPassword(
      dto.email,
    );
    if (existingEmail) {
      throw new ConflictException('Email is already registered.');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.usersService.createOwner(
      dto.email,
      dto.name,
      passwordHash,
    );

    return { ...(await this.issueTokens(user)), user: this.toPublicUser(user) };
  }

  async ownerLogin(
    dto: OwnerLoginDto,
  ): Promise<AuthTokens & { user: PublicUser }> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return { ...(await this.issueTokens(user)), user: this.toPublicUser(user) };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(
        refreshToken,
        { secret: this.configService.get<string>('jwt.refreshSecret') },
      );

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User no longer exists');
      }

      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const payload = {
      sub: user.id,
      role: user.role,
      phoneNumber: user.phoneNumber,
      email: user.email,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: this.configService.get<string>(
          'jwt.accessExpiresIn',
        ) as JwtSignOptions['expiresIn'],
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>(
          'jwt.refreshExpiresIn',
        ) as JwtSignOptions['expiresIn'],
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      phoneNumber: user.phoneNumber,
      email: user.email,
    };
  }
}
