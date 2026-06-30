import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { SupplyChainService } from './supply-chain.service';

@Controller('supply-chain')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.FRANCHISE_OWNER, Role.MANAGER, Role.WAREHOUSE_OPERATOR)
export class SupplyChainController {
  constructor(private readonly service: SupplyChainService) {}
  @Post('transfers') createTransfer(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.service.createTransfer(user, dto); }
  @Get('transfers') transfers(@CurrentUser() user: AuthUser) { return this.service.transfers(user); }
  @Post('stock-requests') createRequest(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.service.createStockRequest(user, dto); }
  @Get('stock-requests') requests(@CurrentUser() user: AuthUser) { return this.service.stockRequests(user); }
  @Get('forecast') forecast(@CurrentUser() user: AuthUser) { return this.service.forecast(user); }
  @Get('recommendations') recommendations(@CurrentUser() user: AuthUser) { return this.service.recommendations(user); }
}
