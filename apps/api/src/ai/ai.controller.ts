import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../roles/permissions.decorator';
import { PermissionsGuard } from '../roles/permissions.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { AiService } from './ai.service';

@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Permissions('analytics.view', 'reports.view')
@Roles(Role.OWNER, Role.CEO, Role.MANAGER, Role.FINANCE_MANAGER, Role.FRANCHISE_DIRECTOR)
export class AiController {
  constructor(private readonly service: AiService) {}
  @Get('insights') insights(@CurrentUser() user: AuthUser) { return this.service.insights(user); }
  @Post('generate-insights') generate(@CurrentUser() user: AuthUser) { return this.service.generateInsights(user); }
  @Get('sales-forecast') sales(@CurrentUser() user: AuthUser) { return this.service.salesForecast(user); }
  @Get('stock-risk') stock(@CurrentUser() user: AuthUser) { return this.service.stockRisk(user); }
  @Get('customer-predictions') customers(@CurrentUser() user: AuthUser) { return this.service.customerPredictions(user); }
  @Get('kpi-recommendations') kpi(@CurrentUser() user: AuthUser) { return this.service.kpiRecommendations(user); }
}
