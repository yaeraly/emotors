import { MaximumPricePolicy, MaximumPricePolicySource } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Min, ValidateIf } from 'class-validator';

export class UpdateProductMaximumPolicyDto {
  @IsOptional()
  @IsEnum(MaximumPricePolicySource)
  retailMaximumPolicySource?: MaximumPricePolicySource;

  @IsOptional()
  @IsEnum(MaximumPricePolicySource)
  wholesaleMaximumPolicySource?: MaximumPricePolicySource;

  @ValidateIf((dto: UpdateProductMaximumPolicyDto) => dto.retailMaximumPolicySource === MaximumPricePolicySource.PRODUCT)
  @IsOptional()
  @IsEnum(MaximumPricePolicy)
  retailMaximumPolicy?: MaximumPricePolicy;

  @ValidateIf((dto: UpdateProductMaximumPolicyDto) => dto.wholesaleMaximumPolicySource === MaximumPricePolicySource.PRODUCT)
  @IsOptional()
  @IsEnum(MaximumPricePolicy)
  wholesaleMaximumPolicy?: MaximumPricePolicy;

  @ValidateIf((dto: UpdateProductMaximumPolicyDto) => dto.retailMaximumPolicySource === MaximumPricePolicySource.PRODUCT)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maximumRetailMarkupPercent?: number;

  @ValidateIf((dto: UpdateProductMaximumPolicyDto) => dto.wholesaleMaximumPolicySource === MaximumPricePolicySource.PRODUCT)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maximumWholesaleMarkupPercent?: number;

  @IsOptional()
  reason?: string;
}
