import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString } from 'class-validator';
import type { AccountantInvoiceWorkflowStatus } from '../branch-accountant-invoice.presenter';

const WORKFLOW_STATUSES = [
  'PENDING_ACCOUNTANT_REVIEW',
  'INSTALLMENT_APPROVAL_PENDING',
  'READY_FOR_CASHIER',
  'WAITING_FOR_PAYMENT',
  'PAYMENT_SUBMITTED',
  'PAID',
  'PARTIALLY_PAID',
  'REJECTED',
  'CANCELLED',
] as const;

export class BranchAccountantInvoiceQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  orderNumber?: string;

  @IsOptional()
  @IsEnum(WORKFLOW_STATUSES)
  workflowStatus?: AccountantInvoiceWorkflowStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateTo?: Date;
}
