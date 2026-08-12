import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AcademyModule } from './academy/academy.module';
import { AiModule } from './ai/ai.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { BranchesModule } from './branches/branches.module';
import { BranchCeoModule } from './branch-ceo/branch-ceo.module';
import { CommissionsModule } from './commissions/commissions.module';
import { CustomerPriceListModule } from './customers/customer-price-list.module';
import { CustomersModule } from './customers/customers.module';
import { BranchReturnsModule } from './branch-returns/branch-returns.module';
import { DistributionModule } from './distribution/distribution.module';
import { ExpansionModule } from './expansion/expansion.module';
import { BranchAccountantModule } from './branch-accountant/branch-accountant.module';
import { BranchWarehouseModule } from './branch-warehouse/branch-warehouse.module';
import { HqWarehouseModule } from './hq-warehouse/hq-warehouse.module';
import { InventoryCountModule } from './inventory-count/inventory-count.module';
import { InventoryModule } from './inventory/inventory.module';
import { InvestmentModule } from './investment/investment.module';
import { KpiModule } from './kpi/kpi.module';
import { MarketingModule } from './marketing/marketing.module';
import { OperationsModule } from './operations/operations.module';
import { PayrollModule } from './payroll/payroll.module';
import { ProcurementModule } from './procurement/procurement.module';
import { PricingModule } from './pricing/pricing.module';
import { PrismaModule } from './prisma/prisma.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RoyaltyModule } from './royalty/royalty.module';
import { SalesModule } from './sales/sales.module';
import { SalesMotivationModule } from './sales-motivation/sales-motivation.module';
import { ServiceModule } from './service/service.module';
import { SupplyChainModule } from './supply-chain/supply-chain.module';
import { FinanceModule } from './finance/finance.module';
import { TaxModule } from './tax/tax.module';
import { UsersModule } from './users/users.module';
import { FranchiseDirectorModule } from './franchise-director/franchise-director.module';
import { HqB2bSalesModule } from './hq-b2b-sales/hq-b2b-sales.module';
import { DevAdminModule } from './dev-admin/dev-admin.module';
import { BusinessDateModule } from './business-date/business-date.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    NotificationsModule,
    AuthModule,
    BranchesModule,
    CommissionsModule,
    CustomersModule,
    CustomerPriceListModule,
    DistributionModule,
    BranchReturnsModule,
    InventoryModule,
    InventoryCountModule,
    HqWarehouseModule,
    BranchWarehouseModule,
    BranchCeoModule,
    FranchiseDirectorModule,
    HqB2bSalesModule,
    BranchAccountantModule,
    SalesModule,
    SalesMotivationModule,
    ServiceModule,
    KpiModule,
    PayrollModule,
    AcademyModule,
    MarketingModule,
    OperationsModule,
    RoyaltyModule,
    AnalyticsModule,
    ProcurementModule,
    PricingModule,
    SupplyChainModule,
    InvestmentModule,
    ExpansionModule,
    TaxModule,
    FinanceModule,
    UsersModule,
    AiModule,
    DevAdminModule,
    BusinessDateModule,
  ],
})
export class AppModule {}
