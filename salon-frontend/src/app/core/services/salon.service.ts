import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Salon } from '../models/salon.model';
import { SalonService as SalonServiceModel } from '../models/service.model';
import { Staff } from '../models/staff.model';

export interface SalonPayload {
  name: string;
  address: string;
  city?: string;
  geoLat?: number;
  geoLng?: number;
  description?: string;
  coverImage?: string;
  openingTime?: string;
  closingTime?: string;
}

export interface ServicePayload {
  name: string;
  price: number;
  durationMinutes: number;
  category?: string;
  isActive?: boolean;
}

export interface StaffPayload {
  name: string;
  photo?: string;
  specialization?: string;
  userId?: string;
  isAvailable?: boolean;
}

@Injectable({ providedIn: 'root' })
export class SalonService {
  constructor(private readonly http: HttpClient) {}

  /** Cached signal for the owner dashboard - loaded once via loadSalon(). */
  readonly salon = signal<Salon | null>(null);
  readonly salonLoaded = signal(false);

  async getTheSalon(): Promise<Salon | null> {
    const salons = await firstValueFrom(
      this.http.get<Salon[]>(`${environment.apiUrl}/salons`),
    );
    return salons[0] ?? null;
  }

  async loadSalon(): Promise<Salon | null> {
    const salon = await this.getTheSalon();
    this.salon.set(salon);
    this.salonLoaded.set(true);
    return salon;
  }

  async createSalon(payload: SalonPayload): Promise<Salon> {
    const salon = await firstValueFrom(
      this.http.post<Salon>(`${environment.apiUrl}/salons`, payload),
    );
    this.salon.set(salon);
    return salon;
  }

  async updateSalon(salonId: string, payload: Partial<SalonPayload>): Promise<Salon> {
    const salon = await firstValueFrom(
      this.http.patch<Salon>(`${environment.apiUrl}/salons/${salonId}`, payload),
    );
    this.salon.set(salon);
    return salon;
  }

  getServices(salonId: string) {
    return firstValueFrom(
      this.http.get<SalonServiceModel[]>(
        `${environment.apiUrl}/salons/${salonId}/services`,
      ),
    );
  }

  createService(salonId: string, payload: ServicePayload) {
    return firstValueFrom(
      this.http.post<SalonServiceModel>(
        `${environment.apiUrl}/salons/${salonId}/services`,
        payload,
      ),
    );
  }

  updateService(serviceId: string, payload: Partial<ServicePayload>) {
    return firstValueFrom(
      this.http.patch<SalonServiceModel>(
        `${environment.apiUrl}/services/${serviceId}`,
        payload,
      ),
    );
  }

  deleteService(serviceId: string) {
    return firstValueFrom(
      this.http.delete<void>(`${environment.apiUrl}/services/${serviceId}`),
    );
  }

  getStaff(salonId: string) {
    return firstValueFrom(
      this.http.get<Staff[]>(`${environment.apiUrl}/salons/${salonId}/staff`),
    );
  }

  createStaff(salonId: string, payload: StaffPayload) {
    return firstValueFrom(
      this.http.post<Staff>(
        `${environment.apiUrl}/salons/${salonId}/staff`,
        payload,
      ),
    );
  }

  updateStaff(staffId: string, payload: Partial<StaffPayload>) {
    return firstValueFrom(
      this.http.patch<Staff>(`${environment.apiUrl}/staff/${staffId}`, payload),
    );
  }

  deleteStaff(staffId: string) {
    return firstValueFrom(
      this.http.delete<void>(`${environment.apiUrl}/staff/${staffId}`),
    );
  }
}
