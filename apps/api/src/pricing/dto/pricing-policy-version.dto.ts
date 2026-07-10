import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePricingPolicyVersionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class PublishPricingPolicyVersionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RollbackPricingPolicyVersionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
