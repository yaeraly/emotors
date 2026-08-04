import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import { ServiceProductItemDto } from './service-product-item.dto';
import { ServiceWorkItemDto } from './service-work-item.dto';

export class CreateServiceOrderDto {
  @IsString()
  @MinLength(1)
  customerId!: string;

  @IsOptional()
  @IsString()
  masterId?: string;

  @IsString()
  @MinLength(1)
  problemDescription!: string;

  @IsOptional()
  @IsString()
  vehicle?: string;

  @IsOptional()
  @IsString()
  licensePlate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  mileage?: number;

  @IsOptional()
  @IsString()
  complaint?: string;

  @IsOptional()
  @IsString()
  diagnosisResult?: string;

  @IsOptional()
  @IsString()
  repairDescription?: string;

  @IsOptional()
  @Type(() => Number)
  laborCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  warrantyDays?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceWorkItemDto)
  workItems?: ServiceWorkItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceProductItemDto)
  productItems?: ServiceProductItemDto[];
}
