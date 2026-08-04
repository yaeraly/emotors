import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role, SalesBonusStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { SaveSalesMotivationDto } from './dto/save-sales-motivation.dto';
import { SalesMotivationService } from './sales-motivation.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sales-motivation')
export class SalesMotivationController {
  constructor(private readonly salesMotivationService: SalesMotivationService) {}

  @Get('settings')
  @Roles(Role.FRANCHISE_OWNER)
  getActiveSettings(@CurrentUser() user: AuthUser) {
    return this.salesMotivationService.getActiveSettings(user);
  }

  @Get('versions')
  @Roles(Role.FRANCHISE_OWNER)
  listVersions(@CurrentUser() user: AuthUser) {
    return this.salesMotivationService.listVersions(user);
  }

  @Get('versions/:id')
  @Roles(Role.FRANCHISE_OWNER)
  getVersion(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salesMotivationService.getVersion(user, id);
  }

  @Get('recommendations')
  @Roles(Role.FRANCHISE_OWNER)
  getRecommendations(@CurrentUser() user: AuthUser) {
    return this.salesMotivationService.getRecommendations(user);
  }

  @Post('settings')
  @Roles(Role.FRANCHISE_OWNER)
  saveVersion(@CurrentUser() user: AuthUser, @Body() dto: SaveSalesMotivationDto) {
    return this.salesMotivationService.saveVersion(user, dto);
  }

  @Post('recommendations/apply')
  @Roles(Role.FRANCHISE_OWNER)
  applyRecommendation(@CurrentUser() user: AuthUser, @Body('comment') comment?: string) {
    return this.salesMotivationService.applyRecommendation(user, comment);
  }

  @Post('bonuses/calculate')
  @Roles(Role.FRANCHISE_OWNER)
  calculateBonuses(
    @CurrentUser() user: AuthUser,
    @Body() body?: { month?: number; year?: number },
  ) {
    return this.salesMotivationService.calculateBonuses(user, body);
  }

  @Get('dashboard')
  @Roles(Role.FRANCHISE_OWNER)
  ceoDashboard(@CurrentUser() user: AuthUser, @Query('sortBy') sortBy?: string) {
    return this.salesMotivationService.ceoDashboard(user, sortBy);
  }

  @Get('my-bonuses')
  @Roles(Role.MANAGER, Role.FRANCHISE_OWNER)
  myBonuses(@CurrentUser() user: AuthUser) {
    return this.salesMotivationService.myBonuses(user);
  }

  @Post('bonuses/:id/status')
  @Roles(Role.FRANCHISE_OWNER)
  updateBonusStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body('status') status: SalesBonusStatus,
  ) {
    return this.salesMotivationService.updateBonusStatus(user, id, status);
  }
}
