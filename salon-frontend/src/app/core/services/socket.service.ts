import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Socket, io } from 'socket.io-client';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;

  // Socket.IO rooms live on the server per connection, so they're lost every
  // time the socket reconnects (phone screen locks, network blip, Render
  // cold start). Remember what we joined and re-join on every (re)connect -
  // otherwise live updates silently stop after the first disconnect.
  private readonly salonRooms = new Set<string>();
  private readonly queueRooms = new Set<string>();

  private connect(): Socket {
    if (!this.socket) {
      this.socket = io(environment.socketUrl, { transports: ['websocket'] });
      this.socket.on('connect', () => this.rejoinRooms());
    }
    return this.socket;
  }

  private rejoinRooms(): void {
    this.salonRooms.forEach((salonId) =>
      this.socket?.emit('join_salon_room', { salonId }),
    );
    this.queueRooms.forEach((entryId) =>
      this.socket?.emit('join_queue', { entryId }),
    );
  }

  joinSalonRoom(salonId: string): void {
    this.salonRooms.add(salonId);
    this.connect().emit('join_salon_room', { salonId });
  }

  joinQueueRoom(entryId: string): void {
    this.queueRooms.add(entryId);
    this.connect().emit('join_queue', { entryId });
  }

  leaveQueueRoom(entryId: string): void {
    this.queueRooms.delete(entryId);
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
