import { PublicUser } from './user.model';

export interface Review {
  id: string;
  salonId: string;
  customerId: string;
  customer?: PublicUser;
  rating: number;
  comment: string | null;
  createdAt: string;
}
