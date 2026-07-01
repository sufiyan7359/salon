import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Salon } from '../../salons/entities/salon.entity';

@Entity('services')
export class Service {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  salonId: string;

  @ManyToOne(() => Salon, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'salonId' })
  salon: Salon;

  @Column()
  name: string;

  @Column({ type: 'double precision' })
  price: number;

  @Column()
  durationMinutes: number;

  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  @Column({ default: true })
  isActive: boolean;
}
