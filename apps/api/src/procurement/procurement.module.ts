import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { InventoryModule } from '../inventory/inventory.module';
import { LandedCostModule } from './landed-cost.module';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { SupplierPaymentWorkflowService } from './supplier-payment-workflow.service';

@Module({
  imports: [InventoryModule, LandedCostModule, FinanceModule],
  controllers: [ProcurementController],
  providers: [ProcurementService, SupplierPaymentWorkflowService],
  exports: [ProcurementService, LandedCostModule, SupplierPaymentWorkflowService],
})
export class ProcurementModule {}
