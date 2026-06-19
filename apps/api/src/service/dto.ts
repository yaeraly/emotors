import { ServiceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ServiceTaskDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  laborCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  partsCost?: number;

  @IsOptional()
  @IsEnum(ServiceStatus)
  status?: ServiceStatus;
}

export class CreateServiceOrderDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  vehicleInfo?: string;

  @IsString()
  problem: string;

  @IsOptional()
  @IsString()
  diagnostic?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceTaskDto)
  tasks?: ServiceTaskDto[];
}

export class UpdateServiceOrderDto {
  @IsOptional()
  @IsEnum(ServiceStatus)
  status?: ServiceStatus;

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  diagnostic?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  finalCost?: number;
}

export class WarrantyDto {
  @IsString()
  title: string;

  @IsDateString()
  expiresAt: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
