import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { BranchWarehouseService } from './branch-warehouse.service';

const BRANCH_WAREHOUSE_OPERATOR_ROLES = [Role.WAREHOUSE_OPERATOR] as const;

@Controller('branch-warehouse')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchWarehouseOperatorController {
  constructor(private readonly service: BranchWarehouseService) {}

  @Get('requests')
  @Roles(...BRANCH_WAREHOUSE_OPERATOR_ROLES)
  listRequests(@CurrentUser() user: AuthUser) {
    return this.service.listBranchRequests(user);
  }

  @Get('requests/:id')
  @Roles(...BRANCH_WAREHOUSE_OPERATOR_ROLES)
  getRequest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getBranchRequest(user, id);
  }

  @Get('stock')
  @Roles(...BRANCH_WAREHOUSE_OPERATOR_ROLES)
  listStock(@CurrentUser() user: AuthUser) {
    return this.service.listOperationalStock(user);
  }

  @Get('warehouse/summary')
  @Roles(...BRANCH_WAREHOUSE_OPERATOR_ROLES)
  warehouseSummary(@CurrentUser() user: AuthUser) {
    return this.service.warehouseSummary(user);
  }
}
