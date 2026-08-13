import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class OpenCashierShiftDto {
  @IsString()
  accountId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  openingBalance!: number;

  @IsOptional()
  @IsString()
  comments?: string;
}

export class CloseCashierShiftDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualBalance!: number;

  @IsOptional()
  @IsString()
  comments?: string;
}
