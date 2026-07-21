import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { InventoryModule } from '../inventory/inventory.module';
import { LandedCostModule } from './landed-cost.module';
import { PaymentInfoService } from './payment-info.service';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { SupplierPaymentWorkflowService } from './supplier-payment-workflow.service';
import { TransportExpenseService } from './transport-expense.service';

@Module({
  imports: [InventoryModule, LandedCostModule, FinanceModule],
  controllers: [ProcurementController],
  providers: [
    ProcurementService,
    SupplierPaymentWorkflowService,
    PaymentInfoService,
    TransportExpenseService,
  ],
  exports: [
    ProcurementService,
    LandedCostModule,
    SupplierPaymentWorkflowService,
    PaymentInfoService,
    TransportExpenseService,
  ],
})
export class ProcurementModule {}
