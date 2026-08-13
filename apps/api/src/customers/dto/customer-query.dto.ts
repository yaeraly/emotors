import { CustomerStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export const CUSTOMER_LIST_SCOPES = ['active', 'archived'] as const;
export type CustomerListScope = (typeof CUSTOMER_LIST_SCOPES)[number];

export class CustomerQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsIn(CUSTOMER_LIST_SCOPES)
  scope?: CustomerListScope;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived?: boolean;
}
