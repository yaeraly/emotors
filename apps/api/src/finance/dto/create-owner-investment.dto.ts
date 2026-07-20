import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateOwnerInvestmentDto {
  @IsString()
  accountId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsIn(['OWNER_INVESTMENT', 'CAPITAL_INJECTION'])
  investmentType?: 'OWNER_INVESTMENT' | 'CAPITAL_INJECTION';

  @IsOptional()
  @IsString()
  notes?: string;
}
