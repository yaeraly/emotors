import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { CommissionsService } from './commissions.service';

@Controller('commissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.MANAGER, Role.ACCOUNTANT, Role.FINANCE_MANAGER)
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Post('rules')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.MANAGER, Role.ACCOUNTANT, Role.FINANCE_MANAGER)
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

  @Get('repairs/:id')
  repair(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commissionsService.repair(user, id);
  }
}

@Controller('compensation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.MANAGER, Role.ACCOUNTANT, Role.FINANCE_MANAGER)
export class CompensationController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Post('rules')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.MANAGER)
  createRule(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.commissionsService.createRule(user, dto);
  }

  @Get('rules')
  rules(@CurrentUser() user: AuthUser) {
    return this.commissionsService.rules(user);
  }

  @Get('rules/:id')
  rule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commissionsService.rule(user, id);
  }

  @Put('rules/:id')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.MANAGER)
  updateRule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.commissionsService.updateRule(user, id, dto);
  }

  @Delete('rules/:id')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.MANAGER)
  deleteRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commissionsService.deleteRule(user, id);
  }
}
