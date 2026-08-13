import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateBranchFinanceTransferDto {
  @IsString()
  sourceAccountId!: string;

  @IsString()
  destinationAccountId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @MinLength(2)
  reason!: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class UpdateBranchFinanceTransferDto {
  @IsOptional()
  @IsString()
  sourceAccountId?: string;

  @IsOptional()
  @IsString()
  destinationAccountId?: string;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  @MinLength(2)
  reason?: string;
}

export class ReviewBranchFinanceTransferDto {
  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  expectedVersion?: number;
}

export class RejectBranchFinanceTransferDto {
  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  expectedVersion?: number;
}
