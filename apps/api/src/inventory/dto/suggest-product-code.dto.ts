import { IsOptional, IsString, MinLength } from 'class-validator';

export class SuggestProductCodeQueryDto {
  @IsString()
  @MinLength(1)
  categoryId!: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}

export class ValidateProductCodeQueryDto {
  @IsString()
  @MinLength(1)
  sku!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  excludeProductId?: string;
}
