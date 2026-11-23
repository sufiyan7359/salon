export interface Salon {
  id: string;
  ownerId: string;
  name: string;
  address: string;
  city: string | null;
  geoLat: number | null;
  geoLng: number | null;
  description: string | null;
  coverImage: string | null;
  openingTime: string | null;
  closingTime: string | null;
  avgRating: number;
  createdAt: string;
  updatedAt: string;
}
