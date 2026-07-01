import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Socket, io } from 'socket.io-client';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;

  private connect(): Socket {
    if (!this.socket) {
      this.socket = io(environment.socketUrl, { transports: ['websocket'] });
    }
    return this.socket;
  }

  joinSalonRoom(salonId: string): void {
    this.connect().emit('join_salon_room', { salonId });
  }

  joinQueueRoom(entryId: string): void {
    this.connect().emit('join_queue', { entryId });
  }

  leaveQueueRoom(entryId: string): void {
    this.socket?.emit('leave_queue', { entryId });
  }

  on<T>(event: string): Observable<T> {
    return new Observable<T>((subscriber) => {
      const socket = this.connect();
      const handler = (data: T) => subscriber.next(data);
      socket.on(event, handler);
      return () => socket.off(event, handler);
    });
  }
}
