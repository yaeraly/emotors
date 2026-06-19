import { CustomerEventType, CustomerStatus, FollowUpStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  fullName: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  whatsappPhone?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  whatsappPhone?: string;

  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @IsOptional()
  @IsNumber()
  totalPurchaseAmount?: number;

  @IsOptional()
  @IsNumber()
  totalProfitAmount?: number;

  @IsOptional()
  @IsNumber()
  totalDebtAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CustomerEventDto {
  @IsOptional()
  @IsEnum(CustomerEventType)
  type?: CustomerEventType;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  details?: string;
}

export class FollowUpDto {
  @IsString()
  title: string;

  @IsDateString()
  dueAt: string;

  @IsOptional()
  @IsEnum(FollowUpStatus)
  status?: FollowUpStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
