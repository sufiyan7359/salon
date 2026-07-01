import { Salon } from './salon.model';
import { SalonService } from './service.model';
import { Staff } from './staff.model';
import { PublicUser } from './user.model';

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export interface Booking {
  id: string;
  salonId: string;
  salon?: Salon;
  customerId: string;
  customer?: PublicUser;
  serviceId: string;
  service: SalonService;
  staffId: string | null;
  staff: Staff | null;
  bookingDate: string;
  bookingTime: string;
  status: BookingStatus;
  createdAt: string;
}
