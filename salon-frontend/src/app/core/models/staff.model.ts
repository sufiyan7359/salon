export interface Staff {
  id: string;
  salonId: string;
  userId: string | null;
  name: string;
  photo: string | null;
  specialization: string | null;
  isAvailable: boolean;
}
