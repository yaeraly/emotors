import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { UpsertPricingPolicyDto } from './dto/upsert-pricing-policy.dto';
import { UpdateCategoryMarkupDto, UpdateProductPricingDto } from './dto/pricing-catalog.dto';
import {
  PricingHistoryQueryDto,
  UpdateBranchPricingDto,
  UpdateFranchiseSalesDto,
  UpdateRetailPricingDto,
  UpdateWholesalePricingDto,
} from './dto/pricing-branch.dto';
import { AssignBranchPriceProfileDto, UpsertBranchPriceProfileDto } from './dto/branch-price-profile.dto';
import {
  ProductPriceOverrideQueryDto,
  UpdateProductPriceOverrideDto,
  UpsertProductPriceOverrideDto,
} from './dto/product-price-override.dto';
import { PricingCatalogService } from './pricing-catalog.service';
import { PricingCategoryDiscountService } from './pricing-category-discount.service';
import { PricingOverrideService } from './pricing-override.service';
import { PricingProfileService } from './pricing-profile.service';
import { PricingService } from './pricing.service';
import { PricingVersionService } from './pricing-version.service';
import { UpsertProfileCategoryDiscountsDto } from './dto/pricing-category-discount.dto';
import {
  CreatePricingPolicyVersionDto,
  PublishPricingPolicyVersionDto,
  RollbackPricingPolicyVersionDto,
} from './dto/pricing-policy-version.dto';

const PRICING_VIEW_ROLES = [
  Role.OWNER,
  Role.CEO,
  Role.HQ_SALES_MANAGER,
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
] as const;

@Controller('pricing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PricingController {
  constructor(
    private readonly pricingService: PricingService,
    private readonly pricingCatalogService: PricingCatalogService,
    private readonly pricingProfileService: PricingProfileService,
    private readonly pricingOverrideService: PricingOverrideService,
    private readonly pricingCategoryDiscountService: PricingCategoryDiscountService,
    private readonly pricingVersionService: PricingVersionService,
  ) {}

  @Get('categories')
  @Roles(...PRICING_VIEW_ROLES)
  listCategories(@CurrentUser() user: AuthUser) {
    return this.pricingCatalogService.listCategories(user);
  }

  @Put('categories/:id/markup')
  @Roles(Role.CEO)
  updateCategoryMarkup(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCategoryMarkupDto) {
    return this.pricingCatalogService.updateCategoryMarkup(user, id, dto);
  }

  @Get('franchise-sales')
  @Roles(...PRICING_VIEW_ROLES)
  listFranchiseSales(@CurrentUser() user: AuthUser) {
    return this.pricingCatalogService.listFranchiseSalesProducts(user);
  }

  @Put('franchise-sales/:id')
  @Roles(Role.CEO)
  updateFranchiseSales(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateFranchiseSalesDto,
  ) {
    return this.pricingCatalogService.updateFranchiseSalesProduct(user, id, dto);
  }

  @Get('branches')
  @Roles(...PRICING_VIEW_ROLES)
  listBranches(@CurrentUser() user: AuthUser) {
    return this.pricingCatalogService.listBranches(user);
  }

  @Put('branches/:id')
  @Roles(Role.CEO)
  updateBranchPricing(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateBranchPricingDto) {
    return this.pricingCatalogService.updateBranchPricing(user, id, dto);
  }

  @Get('retail')
  @Roles(...PRICING_VIEW_ROLES)
  listRetail(@CurrentUser() user: AuthUser) {
    return this.pricingCatalogService.listRetailProducts(user);
  }

  @Put('retail/:id')
  @Roles(Role.CEO)
  updateRetail(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateRetailPricingDto) {
    return this.pricingCatalogService.updateRetailPricing(user, id, dto);
  }

  @Get('wholesale')
  @Roles(...PRICING_VIEW_ROLES)
  listWholesale(@CurrentUser() user: AuthUser) {
    return this.pricingCatalogService.listWholesaleProducts(user);
  }

  @Put('wholesale/:id')
  @Roles(Role.CEO)
  updateWholesale(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateWholesalePricingDto) {
    return this.pricingCatalogService.updateWholesalePricing(user, id, dto);
  }

  @Get('profiles')
  @Roles(...PRICING_VIEW_ROLES)
  listProfiles(@CurrentUser() user: AuthUser) {
    return this.pricingProfileService.list(user);
  }

  @Get('profiles/:id')
  @Roles(...PRICING_VIEW_ROLES)
  findProfile(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pricingProfileService.findOne(user, id);
  }

  @Post('profiles')
  @Roles(Role.CEO)
  createProfile(@CurrentUser() user: AuthUser, @Body() dto: UpsertBranchPriceProfileDto) {
    return this.pricingProfileService.create(user, dto);
  }

  @Put('profiles/:id')
  @Roles(Role.CEO)
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpsertBranchPriceProfileDto,
  ) {
    return this.pricingProfileService.update(user, id, dto);
  }

  @Post('profiles/:id/delete')
  @Roles(Role.CEO)
  deleteProfile(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.pricingProfileService.remove(user, id, body?.reason);
  }

  @Put('profiles/assign-branch/:branchId')
  @Roles(Role.CEO)
  assignBranchProfile(
    @CurrentUser() user: AuthUser,
    @Param('branchId') branchId: string,
    @Body() dto: AssignBranchPriceProfileDto,
  ) {
    return this.pricingProfileService.assignBranch(user, branchId, dto);
  }

  @Get('profiles/:id/category-discounts')
  @Roles(...PRICING_VIEW_ROLES)
  listProfileCategoryDiscounts(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pricingCategoryDiscountService.listForProfile(user, id);
  }

  @Put('profiles/:id/category-discounts')
  @Roles(Role.CEO)
  upsertProfileCategoryDiscounts(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpsertProfileCategoryDiscountsDto,
  ) {
    return this.pricingCategoryDiscountService.upsertForProfile(user, id, dto);
  }

  @Get('versions')
  @Roles(...PRICING_VIEW_ROLES)
  listVersions(@CurrentUser() user: AuthUser) {
    return this.pricingVersionService.list(user);
  }

  @Get('versions/active')
  @Roles(...PRICING_VIEW_ROLES)
  getActiveVersion(@CurrentUser() user: AuthUser) {
    return this.pricingVersionService.getActive(user);
  }

  @Post('versions')
  @Roles(Role.CEO)
  createVersion(@CurrentUser() user: AuthUser, @Body() dto: CreatePricingPolicyVersionDto) {
    return this.pricingVersionService.create(user, dto);
  }

  @Post('versions/:id/publish')
  @Roles(Role.CEO)
  publishVersion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PublishPricingPolicyVersionDto,
  ) {
    return this.pricingVersionService.publish(user, id, dto);
  }

  @Post('versions/:id/rollback')
  @Roles(Role.CEO)
  rollbackVersion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RollbackPricingPolicyVersionDto,
  ) {
    return this.pricingVersionService.rollback(user, id, dto);
  }

  @Get('overrides')
  @Roles(...PRICING_VIEW_ROLES)
  listOverrides(@CurrentUser() user: AuthUser, @Query() query: ProductPriceOverrideQueryDto) {
    return this.pricingOverrideService.list(user, query);
  }

  @Get('overrides/:id')
  @Roles(...PRICING_VIEW_ROLES)
  findOverride(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pricingOverrideService.findOne(user, id);
  }

  @Post('overrides')
  @Roles(Role.CEO)
  createOverride(@CurrentUser() user: AuthUser, @Body() dto: UpsertProductPriceOverrideDto) {
    return this.pricingOverrideService.create(user, dto);
  }

  @Put('overrides/:id')
  @Roles(Role.CEO)
  updateOverride(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductPriceOverrideDto,
  ) {
    return this.pricingOverrideService.update(user, id, dto);
  }

  @Post('overrides/:id/approve')
  @Roles(Role.CEO)
  approveOverride(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pricingOverrideService.approve(user, id);
  }

  @Post('overrides/:id/cancel')
  @Roles(Role.CEO)
  cancelOverride(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.pricingOverrideService.cancel(user, id, body?.reason);
  }

  @Get('history')
  @Roles(...PRICING_VIEW_ROLES)
  listHistory(@CurrentUser() user: AuthUser, @Query() query: PricingHistoryQueryDto) {
    return this.pricingCatalogService.listPricingHistory(user, query);
  }

  @Get('products')
  @Roles(...PRICING_VIEW_ROLES)
  listProducts(@CurrentUser() user: AuthUser) {
    return this.pricingCatalogService.listProducts(user);
  }

  @Put('products/:id')
  @Roles(Role.CEO)
  updateProductPricing(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProductPricingDto) {
    return this.pricingCatalogService.updateProductPricing(user, id, dto);
  }

  @Post('products/:id/restore-auto')
  @Roles(Role.CEO)
  restoreProductAuto(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.pricingCatalogService.restoreProductAuto(user, id, body?.reason);
  }

  @Post('sync-costs')
  @Roles(Role.CEO)
  syncCosts(@CurrentUser() user: AuthUser) {
    return this.pricingCatalogService.refreshCostsAndAutoPrices(user);
  }

  @Get('policies')
  @Roles(...PRICING_VIEW_ROLES)
  list(@CurrentUser() user: AuthUser) {
    return this.pricingService.list(user);
  }

  @Get('policies/sku/:sku')
  @Roles(...PRICING_VIEW_ROLES)
  findBySku(@CurrentUser() user: AuthUser, @Param('sku') sku: string) {
    return this.pricingService.findBySku(user, sku);
  }

  @Get('policies/:id/history')
  @Roles(...PRICING_VIEW_ROLES)
  history(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pricingService.history(user, id);
  }

  @Get('policies/:id')
  @Roles(...PRICING_VIEW_ROLES)
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pricingService.findOne(user, id);
  }

  @Post('policies')
  @Roles(Role.CEO)
  create(@CurrentUser() user: AuthUser, @Body() dto: UpsertPricingPolicyDto) {
    return this.pricingService.create(user, dto);
  }

  @Put('policies/:id')
  @Roles(Role.CEO)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertPricingPolicyDto) {
    return this.pricingService.update(user, id, dto);
  }

  @Post('policies/:id/activate')
  @Roles(Role.CEO)
  activate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.pricingService.activate(user, id, body?.reason);
  }

  @Post('policies/:id/archive')
  @Roles(Role.CEO)
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.pricingService.archive(user, id, body?.reason);
  }
}
