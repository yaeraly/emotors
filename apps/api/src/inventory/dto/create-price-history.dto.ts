import { Type } from 'class-transformer';
import { IsDate, IsNumber, IsOptional, Min } from 'class-validator';

export class CreatePriceHistoryDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchasePriceYuan!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  yuanRate!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  transportCostPerKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  transportCostKgs?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sellingPriceKgs!: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveFrom?: Date;
}
