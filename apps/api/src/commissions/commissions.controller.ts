import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { CommissionsService } from './commissions.service';

@Controller('commissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.MANAGER, Role.MASTER, Role.SALESPERSON)
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Post('rules')
  @Roles(Role.OWNER, Role.MANAGER)
  createRule(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.commissionsService.createRule(user, dto);
  }

  @Get('rules')
  rules(@CurrentUser() user: AuthUser) {
    return this.commissionsService.rules(user);
  }

  @Get('sales')
  sales(@CurrentUser() user: AuthUser) {
    return this.commissionsService.sales(user);
  }

  @Get('repairs')
  repairs(@CurrentUser() user: AuthUser) {
    return this.commissionsService.repairs(user);
  }
}
