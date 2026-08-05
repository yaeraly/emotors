import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { InventoryModule } from '../inventory/inventory.module';
import { AccountantBillsService } from './accountant-bills.service';
import { CashierBillsService } from './cashier-bills.service';
import { LandedCostModule } from './landed-cost.module';
import { PaymentInfoService } from './payment-info.service';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { PurchaseAssistantService } from './purchase-assistant.service';
import { SupplierPaymentWorkflowService } from './supplier-payment-workflow.service';
import { TransportExpenseService } from './transport-expense.service';
import { ReceiptDeliveryService } from './receipt-delivery.service';

@Module({
  imports: [InventoryModule, LandedCostModule, FinanceModule],
  controllers: [ProcurementController],
  providers: [
    ProcurementService,
    PurchaseAssistantService,
    SupplierPaymentWorkflowService,
    PaymentInfoService,
    TransportExpenseService,
    AccountantBillsService,
    CashierBillsService,
    ReceiptDeliveryService,
  ],
  exports: [
    ProcurementService,
    PurchaseAssistantService,
    LandedCostModule,
    SupplierPaymentWorkflowService,
    PaymentInfoService,
    TransportExpenseService,
    AccountantBillsService,
    CashierBillsService,
    ReceiptDeliveryService,
  ],
})
export class ProcurementModule {}
