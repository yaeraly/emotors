import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { UpsertPricingPolicyDto } from './dto/upsert-pricing-policy.dto';
import { PricingService } from './pricing.service';

@Controller('pricing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get('policies')
  @Roles(
    Role.OWNER,
    Role.CEO,
    Role.HQ_SALES_MANAGER,
    Role.SUPPLY_CHAIN_MANAGER,
    Role.WAREHOUSE_MANAGER,
    Role.FINANCE_MANAGER,
    Role.HQ_ACCOUNTANT,
    Role.ACCOUNTANT,
    Role.MARKETING_MANAGER,
    Role.CONTENT_CREATOR,
    Role.SYSTEM_ADMINISTRATOR,
    Role.HQ_CASHIER,
    Role.FRANCHISE_OWNER,
    Role.MANAGER,
    Role.WAREHOUSE_OPERATOR,
    Role.CASHIER,
  )
  list(@CurrentUser() user: AuthUser) {
    return this.pricingService.list(user);
  }

  @Get('policies/sku/:sku')
  @Roles(
    Role.OWNER,
    Role.CEO,
    Role.HQ_SALES_MANAGER,
    Role.SUPPLY_CHAIN_MANAGER,
    Role.WAREHOUSE_MANAGER,
    Role.FINANCE_MANAGER,
    Role.HQ_ACCOUNTANT,
    Role.ACCOUNTANT,
    Role.MARKETING_MANAGER,
    Role.CONTENT_CREATOR,
    Role.SYSTEM_ADMINISTRATOR,
    Role.HQ_CASHIER,
    Role.FRANCHISE_OWNER,
    Role.MANAGER,
    Role.WAREHOUSE_OPERATOR,
    Role.CASHIER,
  )
  findBySku(@CurrentUser() user: AuthUser, @Param('sku') sku: string) {
    return this.pricingService.findBySku(user, sku);
  }

  @Get('policies/:id/history')
  @Roles(
    Role.OWNER,
    Role.CEO,
    Role.HQ_SALES_MANAGER,
    Role.SUPPLY_CHAIN_MANAGER,
    Role.WAREHOUSE_MANAGER,
    Role.FINANCE_MANAGER,
    Role.HQ_ACCOUNTANT,
    Role.ACCOUNTANT,
    Role.MARKETING_MANAGER,
    Role.CONTENT_CREATOR,
    Role.SYSTEM_ADMINISTRATOR,
    Role.HQ_CASHIER,
    Role.FRANCHISE_OWNER,
    Role.MANAGER,
    Role.WAREHOUSE_OPERATOR,
    Role.CASHIER,
  )
  history(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pricingService.history(user, id);
  }

  @Get('policies/:id')
  @Roles(
    Role.OWNER,
    Role.CEO,
    Role.HQ_SALES_MANAGER,
    Role.SUPPLY_CHAIN_MANAGER,
    Role.WAREHOUSE_MANAGER,
    Role.FINANCE_MANAGER,
    Role.HQ_ACCOUNTANT,
    Role.ACCOUNTANT,
    Role.MARKETING_MANAGER,
    Role.CONTENT_CREATOR,
    Role.SYSTEM_ADMINISTRATOR,
    Role.HQ_CASHIER,
    Role.FRANCHISE_OWNER,
    Role.MANAGER,
    Role.WAREHOUSE_OPERATOR,
    Role.CASHIER,
  )
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pricingService.findOne(user, id);
  }

  @Post('policies')
  @Roles(Role.OWNER, Role.CEO)
  create(@CurrentUser() user: AuthUser, @Body() dto: UpsertPricingPolicyDto) {
    return this.pricingService.create(user, dto);
  }

  @Put('policies/:id')
  @Roles(Role.OWNER, Role.CEO)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertPricingPolicyDto) {
    return this.pricingService.update(user, id, dto);
  }

  @Post('policies/:id/activate')
  @Roles(Role.OWNER, Role.CEO)
  activate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.pricingService.activate(user, id, body?.reason);
  }

  @Post('policies/:id/archive')
  @Roles(Role.OWNER, Role.CEO)
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.pricingService.archive(user, id, body?.reason);
  }
}
