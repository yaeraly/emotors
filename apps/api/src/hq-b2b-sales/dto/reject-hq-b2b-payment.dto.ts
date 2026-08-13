import { IsOptional, IsString, MinLength } from 'class-validator';

export class RejectHqB2bPaymentDto {
  @IsString()
  @MinLength(1)
  reason!: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
