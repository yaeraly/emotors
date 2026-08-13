import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../roles/permissions.decorator';
import { PermissionsGuard } from '../roles/permissions.guard';
import { RolesGuard } from '../roles/roles.guard';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@RequirePermissions('reports.view', 'analytics.view')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('hq-dashboard') hq(@CurrentUser() user: AuthUser) { return this.analyticsService.hqDashboard(user); }
  @Get('branch-comparison') comparison(@CurrentUser() user: AuthUser) { return this.analyticsService.branchComparison(user); }
  @Get('sales') sales(@CurrentUser() user: AuthUser) { return this.analyticsService.sales(user); }
  @Get('profit') profit(@CurrentUser() user: AuthUser) { return this.analyticsService.profit(user); }
  @Get('customers') customers(@CurrentUser() user: AuthUser) { return this.analyticsService.customers(user); }
  @Get('inventory') inventory(@CurrentUser() user: AuthUser) { return this.analyticsService.inventory(user); }
}
