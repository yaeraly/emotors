import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { TaxService } from './tax.service';

@Controller('tax')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER, Role.ACCOUNTANT, Role.FINANCE_MANAGER)
export class TaxController {
  constructor(private readonly service: TaxService) {}
  @Post('profiles') createProfile(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.service.createProfile(user, dto); }
  @Get('profiles') profiles(@CurrentUser() user: AuthUser) { return this.service.profiles(user); }
  @Post('reports/generate') generate(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.service.generateReport(user, dto); }
  @Get('reports') reports(@CurrentUser() user: AuthUser) { return this.service.reports(user); }
  @Post('payments') payments(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.service.createPayment(user, dto); }
  @Get('reminders') reminders(@CurrentUser() user: AuthUser) { return this.service.reminders(user); }
}
