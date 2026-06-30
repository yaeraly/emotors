import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../roles/permissions.decorator';
import { PermissionsGuard } from '../roles/permissions.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { KpiService } from './kpi.service';

@Controller('kpi')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Permissions('kpi.view', 'analytics.view')
@Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER, Role.MASTER, Role.FINANCE_MANAGER, Role.FRANCHISE_DIRECTOR)
export class KpiController {
  constructor(private readonly kpiService: KpiService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.kpiService.dashboard(user);
  }

  @Get('employees')
  employees(@CurrentUser() user: AuthUser) {
    return this.kpiService.employeeKpis(user);
  }

  @Get('branches')
  branches(@CurrentUser() user: AuthUser) {
    return this.kpiService.branchComparison(user);
  }

  @Get('branches/:branchId')
  branch(@CurrentUser() user: AuthUser, @Param('branchId') branchId: string) {
    return this.kpiService.branchKpi(user, branchId);
  }

  @Post('targets')
  @Permissions('kpi.view')
  @Roles(Role.OWNER, Role.CEO, Role.FINANCE_MANAGER, Role.FRANCHISE_DIRECTOR)
  targets(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.kpiService.createTarget(user, dto);
  }

  @Get('branch-comparison')
  comparison(@CurrentUser() user: AuthUser) {
    return this.kpiService.branchComparison(user);
  }

  @Post('nps')
  @Permissions('kpi.view')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER, Role.MASTER, Role.FINANCE_MANAGER)
  nps(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.kpiService.createNps(user, dto);
  }
}
