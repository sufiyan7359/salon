import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Review } from '../models/review.model';

export interface CreateReviewPayload {
  salonId: string;
  rating: number;
  comment?: string;
}

@Injectable({ providedIn: 'root' })
export class ReviewService {
  constructor(private readonly http: HttpClient) {}

  create(payload: CreateReviewPayload) {
    return firstValueFrom(
      this.http.post<Review>(`${environment.apiUrl}/reviews`, payload),
    );
  }

  getBySalon(salonId: string) {
    return firstValueFrom(
      this.http.get<Review[]>(`${environment.apiUrl}/salons/${salonId}/reviews`),
    );
  }
}
