import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { BranchHqReturnService } from './branch-hq-return.service';
import { CreateBranchHqReturnDto } from './dto/create-branch-hq-return.dto';
import { DecideBranchHqReturnFinanceDto } from './dto/decide-branch-hq-return-finance.dto';
import { ReceiveBranchHqReturnDto } from './dto/receive-branch-hq-return.dto';
import { RejectBranchHqReturnDto } from './dto/reject-branch-hq-return.dto';
import { SetBranchHqReturnItemPickedDto } from './dto/set-branch-hq-return-item-picked.dto';

const BRANCH_RETURN_ROLES = [
  Role.OWNER,
  Role.CEO,
  Role.FRANCHISE_OWNER,
  Role.MANAGER,
  Role.WAREHOUSE_OPERATOR,
  Role.WAREHOUSE_MANAGER,
  Role.HQ_ACCOUNTANT,
  Role.FINANCE_MANAGER,
] as const;

@Controller('branch-hq-returns')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchHqReturnController {
  constructor(private readonly service: BranchHqReturnService) {}

  @Get()
  @Roles(...BRANCH_RETURN_ROLES)
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.service.list(user, { status });
  }

  @Get(':id')
  @Roles(...BRANCH_RETURN_ROLES)
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post()
  @Roles(Role.OWNER, Role.CEO, Role.WAREHOUSE_OPERATOR)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBranchHqReturnDto) {
    return this.service.create(user, dto);
  }

  @Post(':id/submit')
  @Roles(Role.OWNER, Role.CEO, Role.WAREHOUSE_OPERATOR)
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.submit(user, id);
  }

  @Post(':id/approve')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER, Role.MANAGER)
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.approve(user, id);
  }

  @Post(':id/reject')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER, Role.MANAGER)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectBranchHqReturnDto,
  ) {
    return this.service.reject(user, id, dto);
  }

  @Post(':id/pick')
  @Roles(Role.OWNER, Role.CEO, Role.WAREHOUSE_OPERATOR)
  startPicking(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.startPicking(user, id);
  }

  @Patch(':id/items/:itemId/picked')
  @Roles(Role.OWNER, Role.CEO, Role.WAREHOUSE_OPERATOR)
  setItemPicked(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: SetBranchHqReturnItemPickedDto,
  ) {
    return this.service.setItemPicked(user, id, itemId, dto.picked);
  }

  @Post(':id/pack')
  @Roles(Role.OWNER, Role.CEO, Role.WAREHOUSE_OPERATOR)
  pack(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.pack(user, id);
  }

  @Post(':id/ship')
  @Roles(Role.OWNER, Role.CEO, Role.WAREHOUSE_OPERATOR)
  ship(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.ship(user, id);
  }

  @Post(':id/receive')
  @Roles(Role.OWNER, Role.CEO, Role.WAREHOUSE_MANAGER)
  receive(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReceiveBranchHqReturnDto,
  ) {
    return this.service.receive(user, id, dto);
  }

  @Post(':id/finance-decision')
  @Roles(Role.OWNER, Role.CEO, Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER)
  decideFinance(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DecideBranchHqReturnFinanceDto,
  ) {
    return this.service.decideFinance(user, id, dto);
  }

  @Post(':id/cancel')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER, Role.MANAGER, Role.WAREHOUSE_OPERATOR)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancel(user, id);
  }
}
