import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../roles/permissions.decorator';
import { PermissionsGuard } from '../roles/permissions.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { MarketingService } from './marketing.service';

@Controller('marketing')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Permissions('marketing.manage', 'marketing.content')
@Roles(Role.OWNER, Role.CEO, Role.MARKETING_MANAGER, Role.CONTENT_CREATOR, Role.MANAGER)
export class MarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  @Post('assets')
  @Permissions('marketing.manage', 'marketing.content')
  @Roles(Role.OWNER, Role.CEO, Role.MARKETING_MANAGER, Role.CONTENT_CREATOR)
  createAsset(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.marketingService.createAsset(user, dto);
  }

  @Get('assets')
  assets(@Query() query: any) {
    return this.marketingService.assets(query);
  }

  @Get('assets/:id')
  asset(@Param('id') id: string) {
    return this.marketingService.asset(id);
  }

  @Post('campaigns')
  @Permissions('marketing.manage')
  @Roles(Role.OWNER, Role.CEO, Role.MARKETING_MANAGER)
  createCampaign(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.marketingService.createCampaign(user, dto);
  }

  @Get('campaigns')
  campaigns() {
    return this.marketingService.campaigns();
  }
}
