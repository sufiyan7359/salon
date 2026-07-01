import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { QueueEntry, QueueEntryWithPosition } from '../models/queue-entry.model';

export interface JoinQueuePayload {
  salonId: string;
  serviceIds: string[];
  staffId?: string;
}

@Injectable({ providedIn: 'root' })
export class QueueService {
  constructor(private readonly http: HttpClient) {}

  join(payload: JoinQueuePayload) {
    return firstValueFrom(
      this.http.post<QueueEntry>(`${environment.apiUrl}/queue/join`, payload),
    );
  }

  getLiveQueue(salonId: string) {
    return firstValueFrom(
      this.http.get<QueueEntryWithPosition[]>(
        `${environment.apiUrl}/queue/${salonId}/live`,
      ),
    );
  }

  getMyStatus(entryId: string) {
    return firstValueFrom(
      this.http.get<QueueEntryWithPosition>(
        `${environment.apiUrl}/queue/my-status/${entryId}`,
      ),
    );
  }

  leave(entryId: string) {
    return firstValueFrom(
      this.http.delete<QueueEntry>(`${environment.apiUrl}/queue/${entryId}/leave`),
    );
  }
}
