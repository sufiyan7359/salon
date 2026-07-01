import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('otp_verifications')
export class OtpVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  phoneNumber: string;

  @Column()
  otpCode: string;

  @Column()
  expiresAt: Date;

  @Column({ default: false })
  isVerified: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
