import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AcademyModule } from './academy/academy.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { BranchesModule } from './branches/branches.module';
import { CustomersModule } from './customers/customers.module';
import { InventoryModule } from './inventory/inventory.module';
import { KpiModule } from './kpi/kpi.module';
import { MarketingModule } from './marketing/marketing.module';
import { PrismaModule } from './prisma/prisma.module';
import { RoyaltyModule } from './royalty/royalty.module';
import { SalesModule } from './sales/sales.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    BranchesModule,
    CustomersModule,
    InventoryModule,
    SalesModule,
    KpiModule,
    AcademyModule,
    MarketingModule,
    RoyaltyModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
