import { FinanceAccountScope, FinanceAccountStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { FINANCE_ACCOUNT_NAME_MAX_LENGTH } from '../finance-account-name.util';

export class CreateFinanceAccountDto {
  @IsString()
  @MaxLength(FINANCE_ACCOUNT_NAME_MAX_LENGTH)
  name!: string;

  @IsString()
  typeCode!: string;

  @IsOptional()
  @IsEnum(FinanceAccountScope)
  scope?: FinanceAccountScope;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankAccountNo?: string;

  @IsOptional()
  @IsString()
  iban?: string;

  @IsOptional()
  @IsString()
  responsibleEmployeeId?: string;

  @IsOptional()
  @IsString()
  qrProvider?: string;

  @IsOptional()
  @IsString()
  qrMerchantId?: string;

  @IsOptional()
  @IsString()
  posTerminalId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  openingBalance?: number;
}

export class UpdateFinanceAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(FINANCE_ACCOUNT_NAME_MAX_LENGTH)
  name?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankAccountNo?: string;

  @IsOptional()
  @IsString()
  iban?: string;

  @IsOptional()
  @IsString()
  responsibleEmployeeId?: string;

  @IsOptional()
  @IsString()
  qrProvider?: string;

  @IsOptional()
  @IsString()
  qrMerchantId?: string;

  @IsOptional()
  @IsString()
  posTerminalId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class FinanceAccountQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsEnum(FinanceAccountStatus)
  status?: FinanceAccountStatus;

  @IsOptional()
  @IsString()
  typeCode?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class SetOpeningBalanceDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AssignFinanceAccountDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  allowedOperations?: string[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
