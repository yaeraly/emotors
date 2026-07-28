import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { PricingEnginePriceType, Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { canViewPriceExplanation } from '../rbac/rbac';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { UpsertPricingPolicyDto } from './dto/upsert-pricing-policy.dto';
import { UpdateCategoryMarkupDto, UpdateProductPricingDto } from './dto/pricing-catalog.dto';
import { UpdateCategoryMaximumPolicyDto } from './dto/category-maximum-policy.dto';
import { UpdateProductMaximumPolicyDto } from './dto/product-maximum-policy.dto';
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
  SchedulePricingPolicyVersionDto,
  VersionActionDto,
} from './dto/pricing-policy-version.dto';
import {
  PreviewRetailMarkupDto,
  PreviewWholesaleMarkupDto,
} from './dto/pricing-markup-preview.dto';
import {
  OverrideMaximumRetailMarkupDto,
  OverrideMaximumWholesaleMarkupDto,
  RestoreMaximumMarkupInheritanceDto,
} from './dto/product-maximum-markup-override.dto';
import { PricingCategoryRuleService } from './pricing-category-rule.service';
import { PricingProductRuleService } from './pricing-product-rule.service';
import { PricingSimulationService } from './pricing-simulation.service';
import { PricingEngineService } from './pricing-engine.service';
import { PricingSettingsService } from './pricing-settings.service';
import { UpdatePricingMasterSettingsDto } from './dto/pricing-master-settings.dto';

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
    private readonly pricingCategoryRuleService: PricingCategoryRuleService,
    private readonly pricingProductRuleService: PricingProductRuleService,
    private readonly pricingSimulationService: PricingSimulationService,
    private readonly pricingVersionService: PricingVersionService,
    private readonly pricingEngineService: PricingEngineService,
    private readonly pricingSettingsService: PricingSettingsService,
  ) {}

  @Get('settings')
  @Roles(...PRICING_VIEW_ROLES)
  getSettings(@CurrentUser() user: AuthUser) {
    return this.pricingSettingsService.get(user);
  }

  @Put('settings')
  @Roles(Role.CEO)
  updateSettings(@CurrentUser() user: AuthUser, @Body() dto: UpdatePricingMasterSettingsDto) {
    return this.pricingSettingsService.update(user, dto);
  }

  @Get('explain')
  @Roles(Role.OWNER, Role.CEO)
  async explainPrice(
    @CurrentUser() user: AuthUser,
    @Query('productId') productId: string,
    @Query('branchId') branchId: string,
    @Query('priceType') priceType?: PricingEnginePriceType,
  ) {
    if (!canViewPriceExplanation(user)) {
      throw new ForbiddenException('Price explanation is available only to CEO and OWNER');
    }
    if (!productId || !branchId) {
      throw new BadRequestException('productId and branchId are required');
    }
    const explanation = await this.pricingEngineService.explainPrice({
      productId,
      branchId,
      priceType: priceType ?? PricingEnginePriceType.BRANCH_PURCHASE,
    });
    await this.pricingService.auditExplanationView(user, explanation);
    return explanation;
  }

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

  @Put('categories/:id/maximum-policy')
  @Roles(Role.CEO)
  updateCategoryMaximumPolicy(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryMaximumPolicyDto,
  ) {
    return this.pricingCatalogService.updateCategoryMaximumPolicy(user, id, dto);
  }

  @Get('products/:id/maximum-policy')
  @Roles(...PRICING_VIEW_ROLES)
  getProductMaximumPolicy(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pricingCatalogService.getProductMaximumPolicy(user, id);
  }

  @Put('products/:id/maximum-policy')
  @Roles(Role.CEO)
  updateProductMaximumPolicy(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductMaximumPolicyDto,
  ) {
    return this.pricingCatalogService.updateProductMaximumPolicy(user, id, dto);
  }

  @Get('franchise-sales')
  @Roles(...PRICING_VIEW_ROLES)
  listFranchiseSales(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.pricingCatalogService.listFranchiseSalesProducts(user, branchId);
  }

  @Put('franchise-sales/:id')
  @Roles(Role.CEO)
  updateFranchiseSales(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateFranchiseSalesDto,
    @Query('branchId') branchId?: string,
  ) {
    return this.pricingCatalogService.updateFranchiseSalesProduct(user, id, dto, branchId);
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
  listRetail(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.pricingCatalogService.listRetailProducts(user, branchId);
  }

  @Put('retail/:id')
  @Roles(Role.CEO)
  updateRetail(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateRetailPricingDto) {
    return this.pricingCatalogService.updateRetailPricing(user, id, dto);
  }

  @Post('retail/:id/preview')
  @Roles(Role.CEO)
  previewRetail(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PreviewRetailMarkupDto,
  ) {
    return this.pricingCatalogService.previewRetailPricing(user, id, dto);
  }

  @Put('retail/:id/maximum-markup-override')
  @Roles(Role.CEO)
  overrideRetailMaximumMarkup(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: OverrideMaximumRetailMarkupDto,
  ) {
    return this.pricingCatalogService.overrideRetailMaximumMarkup(user, id, dto);
  }

  @Delete('retail/:id/maximum-markup-override')
  @Roles(Role.CEO)
  restoreRetailMaximumMarkup(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() _dto: RestoreMaximumMarkupInheritanceDto,
  ) {
    return this.pricingCatalogService.restoreRetailMaximumMarkupInheritance(user, id);
  }

  @Get('wholesale')
  @Roles(...PRICING_VIEW_ROLES)
  listWholesale(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.pricingCatalogService.listWholesaleProducts(user, branchId);
  }

  @Put('wholesale/:id')
  @Roles(Role.CEO)
  updateWholesale(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateWholesalePricingDto) {
    return this.pricingCatalogService.updateWholesalePricing(user, id, dto);
  }

  @Post('wholesale/:id/preview')
  @Roles(Role.CEO)
  previewWholesale(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PreviewWholesaleMarkupDto,
  ) {
    return this.pricingCatalogService.previewWholesalePricing(user, id, dto);
  }

  @Put('wholesale/:id/maximum-markup-override')
  @Roles(Role.CEO)
  overrideWholesaleMaximumMarkup(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: OverrideMaximumWholesaleMarkupDto,
  ) {
    return this.pricingCatalogService.overrideWholesaleMaximumMarkup(user, id, dto);
  }

  @Delete('wholesale/:id/maximum-markup-override')
  @Roles(Role.CEO)
  restoreWholesaleMaximumMarkup(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() _dto: RestoreMaximumMarkupInheritanceDto,
  ) {
    return this.pricingCatalogService.restoreWholesaleMaximumMarkupInheritance(user, id);
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

  @Post('versions/:id/clone')
  @Roles(Role.CEO)
  cloneVersion(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreatePricingPolicyVersionDto) {
    return this.pricingVersionService.clone(user, id, dto);
  }

  @Post('versions/:id/submit-review')
  @Roles(Role.CEO)
  submitVersionReview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: VersionActionDto,
  ) {
    return this.pricingVersionService.submitForReview(user, id, dto);
  }

  @Post('versions/:id/approve')
  @Roles(Role.CEO)
  approveVersion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: VersionActionDto,
  ) {
    return this.pricingVersionService.approve(user, id, dto);
  }

  @Post('versions/:id/schedule')
  @Roles(Role.CEO)
  scheduleVersion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SchedulePricingPolicyVersionDto,
  ) {
    return this.pricingVersionService.schedule(user, id, dto);
  }

  @Get('versions/:id/category-rules')
  @Roles(...PRICING_VIEW_ROLES)
  listVersionCategoryRules(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pricingCategoryRuleService.listForVersion(user, id);
  }

  @Put('versions/:id/category-rules')
  @Roles(Role.CEO)
  upsertVersionCategoryRule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: {
      pricingProfileId: string;
      categoryId: string;
      discountPercent: number;
      reasonNote?: string;
    },
  ) {
    return this.pricingCategoryRuleService.upsert(user, id, dto);
  }

  @Get('versions/:id/product-rules')
  @Roles(...PRICING_VIEW_ROLES)
  listVersionProductRules(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pricingProductRuleService.listForVersion(user, id);
  }

  @Put('versions/:id/product-rules')
  @Roles(Role.CEO)
  upsertVersionProductRule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: {
      pricingProfileId: string;
      productId: string;
      adjustmentMode: 'PERCENTAGE_DISCOUNT' | 'FIXED_AMOUNT_DISCOUNT' | 'FIXED_SELLING_PRICE';
      adjustmentValue: number;
      reasonNote?: string;
    },
  ) {
    return this.pricingProductRuleService.upsert(user, id, dto);
  }

  @Get('versions/:id/simulation')
  @Roles(...PRICING_VIEW_ROLES)
  getVersionSimulation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pricingSimulationService.getLatest(user, id);
  }

  @Post('versions/:id/simulation/refresh')
  @Roles(Role.CEO)
  refreshVersionSimulation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pricingSimulationService.refresh(user, id);
  }

  @Post('versions/:id/validate')
  @Roles(...PRICING_VIEW_ROLES)
  validateVersion(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pricingVersionService.validate(user, id);
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
