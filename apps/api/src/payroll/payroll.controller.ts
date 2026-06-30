import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../roles/permissions.decorator';
import { PermissionsGuard } from '../roles/permissions.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { PayrollService } from './payroll.service';

@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Permissions('payroll.manage')
@Roles(Role.OWNER, Role.CEO, Role.ACCOUNTANT, Role.FINANCE_MANAGER)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.payrollService.list(user);
  }

  @Post('generate')
  generate(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.payrollService.generate(user, dto);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payrollService.detail(user, id);
  }

  @Post(':id/approve')
  @Roles(Role.OWNER, Role.CEO, Role.FINANCE_MANAGER)
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payrollService.approve(user, id);
  }

  @Post(':id/mark-paid')
  markPaid(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payrollService.markPaid(user, id);
  }
}
