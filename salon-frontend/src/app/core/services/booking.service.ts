import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Booking, BookingStatus } from '../models/booking.model';

export interface CreateBookingPayload {
  salonId: string;
  serviceId: string;
  staffId?: string;
  bookingDate: string;
  bookingTime: string;
}

@Injectable({ providedIn: 'root' })
export class BookingService {
  constructor(private readonly http: HttpClient) {}

  create(payload: CreateBookingPayload) {
    return firstValueFrom(
      this.http.post<Booking>(`${environment.apiUrl}/bookings`, payload),
    );
  }

  getMine() {
    return firstValueFrom(
      this.http.get<Booking[]>(`${environment.apiUrl}/bookings/my`),
    );
  }

  getBySalon(salonId: string) {
    return firstValueFrom(
      this.http.get<Booking[]>(`${environment.apiUrl}/bookings/salon/${salonId}`),
    );
  }

  updateStatus(bookingId: string, status: BookingStatus) {
    return firstValueFrom(
      this.http.patch<Booking>(
        `${environment.apiUrl}/bookings/${bookingId}/status`,
        { status },
      ),
    );
  }
}
