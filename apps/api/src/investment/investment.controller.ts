import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { InvestmentService } from './investment.service';

@Controller('investment')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.INVESTMENT_MANAGER)
export class InvestmentController {
  constructor(private readonly service: InvestmentService) {}
  @Post('investors') createInvestor(@Body() dto: any) { return this.service.createInvestor(dto); }
  @Get('investors') investors() { return this.service.investors(); }
  @Post('franchise-candidates') createCandidate(@Body() dto: any) { return this.service.createCandidate(dto); }
  @Get('franchise-candidates') candidates() { return this.service.candidates(); }
  @Post('deals') createDeal(@Body() dto: any) { return this.service.createDeal(dto); }
  @Get('deals') deals() { return this.service.deals(); }
  @Post('matchmaking') createMatchmaking(@Body() dto: any) { return this.service.createMatchmaking(dto); }
  @Get('matchmaking') matchmaking() { return this.service.matchmaking(); }
}
