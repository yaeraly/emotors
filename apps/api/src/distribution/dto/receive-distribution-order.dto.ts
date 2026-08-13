import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ReceiveDistributionOrderItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  shipmentItemId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  distributionOrderItemId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  acceptedQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  receivedQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  damagedQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  missingQuantity?: number;

  @IsOptional()
  @IsString()
  discrepancyReason?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ReceiveDistributionOrderDto {
  @IsString()
  @MinLength(1)
  warehouseId!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  transportCompany?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  transportCostKgs?: number;

  @IsOptional()
  @IsString()
  driverName?: string;

  @IsOptional()
  @IsString()
  vehicleNumber?: string;

  @IsOptional()
  @IsDateString()
  arrivalDate?: string;

  @IsOptional()
  @IsString()
  transportNotes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveDistributionOrderItemDto)
  items?: ReceiveDistributionOrderItemDto[];
}
