import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { QueueService } from './queue.service';
import { JoinQueueDto } from './dto/join-queue.dto';
import { WalkInQueueDto } from './dto/walk-in-queue.dto';
import { CallNextDto } from './dto/call-next.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  @Post('join')
  join(@CurrentUser() user: AuthenticatedUser, @Body() dto: JoinQueueDto) {
    return this.queueService.join(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  @Post(':salonId/walk-in')
  walkIn(
    @Param('salonId') salonId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: WalkInQueueDto,
  ) {
    return this.queueService.walkIn(user.userId, dto, salonId);
  }

  @Get(':salonId/live')
  getLiveQueue(@Param('salonId') salonId: string) {
    return this.queueService.getLiveQueue(salonId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-status/:entryId')
  getStatus(
    @Param('entryId') entryId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.queueService.getStatus(entryId, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  @Patch(':id/call-next')
  callNext(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CallNextDto,
  ) {
    return this.queueService.callNext(id, user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  @Patch(':id/complete')
  complete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.queueService.complete(id, user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  @Patch(':id/no-show')
  noShow(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.queueService.noShow(id, user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/leave')
  leave(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.queueService.leave(id, user);
  }
}
