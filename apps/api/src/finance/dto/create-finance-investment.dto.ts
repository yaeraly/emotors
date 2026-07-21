import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateFinanceInvestmentDto {
  @IsString()
  accountId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @IsIn(['KGS', 'USD', 'EUR', 'CNY', 'RUB'])
  currency!: string;

  @IsDateString()
  investmentDate!: string;

  @IsIn(['OWNER_INVESTMENT', 'INVESTOR_INVESTMENT'])
  investmentType!: 'OWNER_INVESTMENT' | 'INVESTOR_INVESTMENT';

  @IsString()
  @MinLength(1)
  investorOwnerName!: string;

  @IsString()
  @MinLength(1)
  providedBy!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
