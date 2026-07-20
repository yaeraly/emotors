import { FinanceAccountScope, FinanceAccountStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateFinanceAccountDto {
  @IsString()
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

export class UpdateFinanceAccountDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankAccountNo?: string;

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
}
