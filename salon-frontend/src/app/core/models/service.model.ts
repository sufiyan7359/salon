export interface SalonService {
  id: string;
  salonId: string;
  name: string;
  price: number;
  durationMinutes: number;
  category: string | null;
  isActive: boolean;
}
