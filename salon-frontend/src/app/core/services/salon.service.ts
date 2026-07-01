import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Salon } from '../models/salon.model';
import { SalonService as SalonServiceModel } from '../models/service.model';
import { Staff } from '../models/staff.model';

@Injectable({ providedIn: 'root' })
export class SalonService {
  constructor(private readonly http: HttpClient) {}

  async getTheSalon(): Promise<Salon | null> {
    const salons = await firstValueFrom(
      this.http.get<Salon[]>(`${environment.apiUrl}/salons`),
    );
    return salons[0] ?? null;
  }

  getServices(salonId: string) {
    return firstValueFrom(
      this.http.get<SalonServiceModel[]>(
        `${environment.apiUrl}/salons/${salonId}/services`,
      ),
    );
  }

  getStaff(salonId: string) {
    return firstValueFrom(
      this.http.get<Staff[]>(`${environment.apiUrl}/salons/${salonId}/staff`),
    );
  }
}
