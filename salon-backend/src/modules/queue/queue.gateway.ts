import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { QueueService } from './queue.service';

const YOUR_TURN_SOON_THRESHOLD = 3;

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:4200',
    credentials: true,
  },
})
export class QueueGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(QueueGateway.name);

  constructor(private readonly queueService: QueueService) {}

  @SubscribeMessage('join_salon_room')
  handleJoinSalonRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { salonId: string },
  ) {
    void client.join(this.salonRoom(payload.salonId));
  }

  @SubscribeMessage('join_queue')
  handleJoinQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { entryId: string },
  ) {
    void client.join(this.entryRoom(payload.entryId));
  }

  @SubscribeMessage('leave_queue')
  handleLeaveQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { entryId: string },
  ) {
    void client.leave(this.entryRoom(payload.entryId));
  }

  @OnEvent('queue.updated')
  async handleQueueUpdated({
    salonId,
    entryId,
  }: {
    salonId: string;
    entryId: string;
  }) {
    try {
      const liveQueue = await this.queueService.getLiveQueue(salonId);
      this.server.to(this.salonRoom(salonId)).emit('queue_updated', liveQueue);

      for (const entry of liveQueue) {
        this.server.to(this.entryRoom(entry.id)).emit('status_changed', {
          entryId: entry.id,
          status: entry.status,
          position: entry.position,
          peopleAhead: entry.peopleAhead,
          estimatedWaitMinutes: entry.estimatedWaitMinutes,
        });

        if (
          entry.peopleAhead <= YOUR_TURN_SOON_THRESHOLD &&
          entry.peopleAhead > 0
        ) {
          this.server.to(this.entryRoom(entry.id)).emit('your_turn_soon', {
            entryId: entry.id,
            peopleAhead: entry.peopleAhead,
          });
        }
      }

      // Entries that just left the active set (completed/cancelled/no_show)
      // won't appear in liveQueue above, so notify their room directly.
      if (entryId && !liveQueue.some((entry) => entry.id === entryId)) {
        const finalEntry = await this.queueService.getEntrySnapshot(entryId);
        this.server.to(this.entryRoom(entryId)).emit('status_changed', {
          entryId: finalEntry.id,
          status: finalEntry.status,
          position: 0,
          peopleAhead: 0,
          estimatedWaitMinutes: null,
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to broadcast queue update for salon ${salonId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private salonRoom(salonId: string): string {
    return `salon:${salonId}`;
  }

  private entryRoom(entryId: string): string {
    return `entry:${entryId}`;
  }
}
