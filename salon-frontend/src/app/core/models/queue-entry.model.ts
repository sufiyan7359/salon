import { SalonService } from './service.model';
import { Staff } from './staff.model';
import { PublicUser } from './user.model';

export type QueueStatus =
  | 'waiting'
  | 'next'
  | 'in_service'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface QueueEntry {
  id: string;
  salonId: string;
  customerId: string;
  customer?: PublicUser;
  staffId: string | null;
  staff?: Staff | null;
  services: SalonService[];
  tokenNumber: number;
  status: QueueStatus;
  joinedAt: string;
  calledAt: string | null;
  completedAt: string | null;
  estimatedWaitMinutes: number | null;
}

export interface QueueEntryWithPosition extends QueueEntry {
  position: number;
  peopleAhead: number;
}

export const ACTIVE_QUEUE_STATUSES: QueueStatus[] = ['waiting', 'next', 'in_service'];

export const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  waiting: 'Waiting',
  next: 'Up Next',
  in_service: 'In Service',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'You were marked no-show',
};
