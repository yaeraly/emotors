import { BranchPaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AddBranchPaymentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsEnum(BranchPaymentMethod)
  method!: BranchPaymentMethod;

  @IsOptional()
  @IsString()
  note?: string;
}
