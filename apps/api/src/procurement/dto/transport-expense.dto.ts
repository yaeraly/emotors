import { ProcurementPaymentInfoMethod, TransportExpenseType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTransportExpenseDto {
  @IsOptional()
  @IsString()
  procurementOrderId?: string;

  @IsEnum(TransportExpenseType)
  expenseType!: TransportExpenseType;

  @IsOptional()
  @IsString()
  requestType?: string;

  /** Legacy free-text carrier. Prefer transportCompanyId for section payment requests. */
  @IsOptional()
  @IsString()
  supplierCarrier?: string;

  @IsOptional()
  @IsString()
  transportCompanyId?: string;

  @IsOptional()
  @IsString()
  expenseName?: string;

  @IsOptional()
  @IsString()
  expenseCategory?: string;

  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsOptional()
  @IsString()
  route?: string;

  @IsOptional()
  @IsString()
  vehicleInfo?: string;

  @IsOptional()
  @IsString()
  shipmentReference?: string;

  @IsOptional()
  @IsEnum(ProcurementPaymentInfoMethod)
  paymentMethod?: ProcurementPaymentInfoMethod;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountHolder?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  swiftCode?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  sendToAccountant?: boolean;

  /** Optional section budget used to validate remaining unpaid amount. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sectionTotalAmount?: number;

  /** Cargo payment calculation inputs (required for INTERNATIONAL_FREIGHT / CARGO_PAYMENT). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  totalWeightKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  cargoRateUsdPerKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  usdExchangeRate?: number;

  /** Client-calculated totals — validated against server; never trusted alone. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  calculatedAmountUsd?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  calculatedAmountKgs?: number;
}

export class UpdateTransportExpenseDto {
  @IsOptional()
  @IsEnum(TransportExpenseType)
  expenseType?: TransportExpenseType;

  @IsOptional()
  @IsString()
  requestType?: string | null;

  @IsOptional()
  @IsString()
  supplierCarrier?: string;

  @IsOptional()
  @IsString()
  transportCompanyId?: string | null;

  @IsOptional()
  @IsString()
  expenseName?: string | null;

  @IsOptional()
  @IsString()
  expenseCategory?: string | null;

  @IsOptional()
  @IsString()
  recipientName?: string | null;

  @IsOptional()
  @IsString()
  route?: string | null;

  @IsOptional()
  @IsString()
  vehicleInfo?: string | null;

  @IsOptional()
  @IsString()
  shipmentReference?: string | null;

  @IsOptional()
  @IsEnum(ProcurementPaymentInfoMethod)
  paymentMethod?: ProcurementPaymentInfoMethod;

  @IsOptional()
  @IsString()
  bankName?: string | null;

  @IsOptional()
  @IsString()
  accountHolder?: string | null;

  @IsOptional()
  @IsString()
  accountNumber?: string | null;

  @IsOptional()
  @IsString()
  swiftCode?: string | null;

  @IsOptional()
  @IsString()
  invoiceNumber?: string | null;

  @IsOptional()
  @IsDateString()
  invoiceDate?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsString()
  comment?: string | null;

  /** Cargo payment correction inputs (INTERNATIONAL_FREIGHT only). Totals are recalculated server-side. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  totalWeightKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  cargoRateUsdPerKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  usdExchangeRate?: number;
}

export class ApproveTransportExpenseDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  exchangeRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  exchangeRateCnyKgs?: number;

  @IsOptional()
  @IsString()
  financeAccountId?: string;

  @IsOptional()
  @IsString()
  accountantComment?: string;

  @IsOptional()
  sendToCashier?: boolean;
}

export class ConfirmTransportExpenseDto {
  @IsString()
  financeAccountId!: string;

  @IsOptional()
  @IsString()
  transactionNumber?: string;

  @IsOptional()
  @IsString()
  cashierComment?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  /** Optional partial payment amount in KGS. Defaults to remaining unpaid amount. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  paidAmountKgs?: number;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

/** HQ Accountant direct cargo payment from bills-to-pay (KGS). */
export class PayCargoTransportExpenseDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  paymentAmountKgs!: number;

  @IsString()
  financeAccountId!: string;

  @IsOptional()
  @IsString()
  accountantComment?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class ReturnTransportExpenseDto {
  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
