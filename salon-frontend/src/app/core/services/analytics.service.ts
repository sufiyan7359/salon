import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AnalyticsSummary } from '../models/analytics.model';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  constructor(private readonly http: HttpClient) {}

  getSummary(salonId: string) {
    return firstValueFrom(
      this.http.get<AnalyticsSummary>(
        `${environment.apiUrl}/analytics/salon/${salonId}/summary`,
      ),
    );
  }
}
