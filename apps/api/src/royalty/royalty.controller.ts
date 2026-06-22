import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { RoyaltyService } from './royalty.service';

@Controller('royalty')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.ACCOUNTANT)
export class RoyaltyController {
  constructor(private readonly royaltyService: RoyaltyService) {}

  @Post('rules') createRule(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.royaltyService.createRule(user, dto); }
  @Get('rules') rules(@CurrentUser() user: AuthUser) { return this.royaltyService.rules(user); }
  @Post('generate-monthly') generate(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.royaltyService.generateMonthly(user, dto); }
  @Get('invoices') invoices(@CurrentUser() user: AuthUser) { return this.royaltyService.invoices(user); }
  @Post('invoices/:id/pay') pay(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.royaltyService.pay(user, id, dto); }
}
