import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AcademyModule } from './academy/academy.module';
import { AiModule } from './ai/ai.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { BranchesModule } from './branches/branches.module';
import { CommissionsModule } from './commissions/commissions.module';
import { CustomersModule } from './customers/customers.module';
import { DistributionModule } from './distribution/distribution.module';
import { ExpansionModule } from './expansion/expansion.module';
import { InventoryModule } from './inventory/inventory.module';
import { InvestmentModule } from './investment/investment.module';
import { KpiModule } from './kpi/kpi.module';
import { MarketingModule } from './marketing/marketing.module';
import { OperationsModule } from './operations/operations.module';
import { PayrollModule } from './payroll/payroll.module';
import { ProcurementModule } from './procurement/procurement.module';
import { PrismaModule } from './prisma/prisma.module';
import { RoyaltyModule } from './royalty/royalty.module';
import { SalesModule } from './sales/sales.module';
import { ServiceModule } from './service/service.module';
import { SupplyChainModule } from './supply-chain/supply-chain.module';
import { TaxModule } from './tax/tax.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    BranchesModule,
    CommissionsModule,
    CustomersModule,
    DistributionModule,
    InventoryModule,
    SalesModule,
    ServiceModule,
    KpiModule,
    PayrollModule,
    AcademyModule,
    MarketingModule,
    OperationsModule,
    RoyaltyModule,
    AnalyticsModule,
    ProcurementModule,
    SupplyChainModule,
    InvestmentModule,
    ExpansionModule,
    TaxModule,
    UsersModule,
    AiModule,
  ],
})
export class AppModule {}
