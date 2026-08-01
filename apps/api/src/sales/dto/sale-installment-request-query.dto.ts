import { IsIn, IsOptional, IsString } from 'class-validator';
import { SaleInstallmentApprovalStatus } from '@prisma/client';

const LISTABLE_STATUSES = [
  'PENDING_BRANCH_CEO_APPROVAL',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'ACTIVE',
  'PAID',
  'DRAFT',
] as const;

export class SaleInstallmentRequestQueryDto {
  @IsOptional()
  @IsIn(LISTABLE_STATUSES)
  status?: SaleInstallmentApprovalStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
