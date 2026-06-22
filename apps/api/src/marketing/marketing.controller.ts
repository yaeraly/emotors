import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { MarketingService } from './marketing.service';

@Controller('marketing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.MARKETING_MANAGER, Role.MANAGER)
export class MarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  @Post('assets') @Roles(Role.OWNER, Role.MARKETING_MANAGER) createAsset(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.marketingService.createAsset(user, dto); }
  @Get('assets') assets(@Query() query: any) { return this.marketingService.assets(query); }
  @Get('assets/:id') asset(@Param('id') id: string) { return this.marketingService.asset(id); }
  @Post('campaigns') @Roles(Role.OWNER, Role.MARKETING_MANAGER) createCampaign(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.marketingService.createCampaign(user, dto); }
  @Get('campaigns') campaigns() { return this.marketingService.campaigns(); }
}
