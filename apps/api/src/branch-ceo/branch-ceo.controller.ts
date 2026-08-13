import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BranchPricingPolicyService } from '../customers/branch-pricing-policy.service';
import { PreviewBranchPricingDto } from '../customers/dto/preview-branch-pricing.dto';
import { UpdateBranchPricingPolicyDto } from '../customers/dto/update-branch-pricing-policy.dto';
import { BranchInstallmentEarlyPaymentService } from '../distribution/branch-installment-early-payment.service';
import { RejectInstallmentEarlyPaymentDto } from '../distribution/dto/reject-installment-early-payment.dto';
import { ProductQueryDto } from '../inventory/dto/product-query.dto';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { BranchCeoService } from './branch-ceo.service';
import { UpdateBranchCeoWarehouseDto } from './dto/update-branch-ceo-warehouse.dto';

const BRANCH_CEO_ROLES = [Role.FRANCHISE_OWNER] as const;

@Controller('branch-ceo')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchCeoController {
  constructor(
    private readonly service: BranchCeoService,
    private readonly earlyPaymentService: BranchInstallmentEarlyPaymentService,
    private readonly branchPricingPolicyService: BranchPricingPolicyService,
  ) {}

  @Get('pricing-policy')
  @Roles(...BRANCH_CEO_ROLES)
  getPricingPolicy(@CurrentUser() user: AuthUser) {
    return this.branchPricingPolicyService.getForBranchCeo(user);
  }

  @Put('pricing-policy')
  @Roles(...BRANCH_CEO_ROLES)
  updatePricingPolicy(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateBranchPricingPolicyDto,
  ) {
    return this.branchPricingPolicyService.updateForBranchCeo(user, dto);
  }

  @Post('pricing-policy/preview')
  @Roles(...BRANCH_CEO_ROLES)
  previewPricing(@CurrentUser() user: AuthUser, @Body() dto: PreviewBranchPricingDto) {
    return this.branchPricingPolicyService.preview(user, dto);
  }

  @Get('product-directory')
  @Roles(...BRANCH_CEO_ROLES)
  productDirectory(@CurrentUser() user: AuthUser, @Query() query: ProductQueryDto) {
    return this.service.productDirectory(user, query);
  }

  @Get('product-directory/:id')
  @Roles(...BRANCH_CEO_ROLES)
  productDetail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.productDetail(user, id);
  }

  @Get('warehouse')
  @Roles(...BRANCH_CEO_ROLES)
  warehouseOverview(@CurrentUser() user: AuthUser) {
    return this.service.warehouseOverview(user);
  }

  @Get('warehouse/:warehouseId/products')
  @Roles(...BRANCH_CEO_ROLES)
  warehouseProducts(
    @CurrentUser() user: AuthUser,
    @Param('warehouseId') warehouseId: string,
  ) {
    return this.service.warehouseProducts(user, warehouseId);
  }

  @Patch('warehouse')
  @Roles(...BRANCH_CEO_ROLES)
  updateWarehouse(@CurrentUser() user: AuthUser, @Body() dto: UpdateBranchCeoWarehouseDto) {
    return this.service.updateWarehouse(user, dto);
  }

  @Get('early-payment-requests')
  @Roles(...BRANCH_CEO_ROLES)
  listEarlyPaymentRequests(@CurrentUser() user: AuthUser) {
    return this.earlyPaymentService.listPendingForBranchCeo(user);
  }

  @Post('early-payment-requests/:id/approve')
  @Roles(...BRANCH_CEO_ROLES)
  approveEarlyPayment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.earlyPaymentService.approve(user, id);
  }

  @Post('early-payment-requests/:id/reject')
  @Roles(...BRANCH_CEO_ROLES)
  rejectEarlyPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectInstallmentEarlyPaymentDto,
  ) {
    return this.earlyPaymentService.reject(user, id, dto);
  }
}
