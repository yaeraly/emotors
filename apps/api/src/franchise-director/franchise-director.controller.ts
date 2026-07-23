import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { FranchiseDirectorService } from './franchise-director.service';

const FD_ACCESS = [Role.FRANCHISE_DIRECTOR, Role.OWNER, Role.CEO] as const;

@Controller('franchise-director')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...FD_ACCESS)
export class FranchiseDirectorController {
  constructor(private readonly service: FranchiseDirectorService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.service.dashboard(user);
  }

  @Get('branches')
  branches(@CurrentUser() user: AuthUser, @Query() query: Record<string, string | undefined>) {
    return this.service.branches(user, query);
  }

  @Get('branches/:id')
  branchDetail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.branchDetail(user, id);
  }

  @Get('monitoring')
  monitoring(@CurrentUser() user: AuthUser) {
    return this.service.monitoring(user);
  }

  @Get('expansion')
  expansion(@CurrentUser() user: AuthUser) {
    return this.service.listExpansion(user);
  }

  @Post('expansion')
  createExpansion(@CurrentUser() user: AuthUser, @Body() dto: Record<string, unknown>) {
    return this.service.createExpansion(user, dto);
  }

  @Patch('expansion/:id')
  updateExpansion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.service.updateExpansion(user, id, dto);
  }

  @Get('tasks')
  tasks(@CurrentUser() user: AuthUser) {
    return this.service.listTasks(user);
  }

  @Post('tasks')
  createTask(@CurrentUser() user: AuthUser, @Body() dto: Record<string, unknown>) {
    return this.service.createTask(user, dto);
  }

  @Patch('tasks/:id')
  updateTask(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.service.updateTask(user, id, dto);
  }

  @Get('academy')
  academy(@CurrentUser() user: AuthUser) {
    return this.service.academy(user);
  }

  @Get('marketing')
  marketing(@CurrentUser() user: AuthUser) {
    return this.service.marketing(user);
  }

  @Get('supply')
  supply(@CurrentUser() user: AuthUser, @Query() query: Record<string, string | undefined>) {
    return this.service.supply(user, query);
  }

  @Get('finance')
  finance(@CurrentUser() user: AuthUser, @Query() query: Record<string, string | undefined>) {
    return this.service.finance(user, query);
  }

  @Get('reports')
  reports(@CurrentUser() user: AuthUser, @Query() query: Record<string, string | undefined>) {
    return this.service.reports(user, query);
  }

  @Get('notifications')
  notifications(@CurrentUser() user: AuthUser) {
    return this.service.notifications(user);
  }
}
