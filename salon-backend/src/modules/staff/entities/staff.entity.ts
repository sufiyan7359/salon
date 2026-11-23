import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Salon } from '../../salons/entities/salon.entity';
import { User } from '../../users/entities/user.entity';

@Entity('staff')
export class Staff {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  salonId: string;

  @ManyToOne(() => Salon, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'salonId' })
  salon: Salon;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  photo: string | null;

  @Column({ type: 'varchar', nullable: true })
  specialization: string | null;

  @Column({ default: true })
  isAvailable: boolean;
}
