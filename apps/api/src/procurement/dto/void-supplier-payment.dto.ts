import { IsOptional, IsString } from 'class-validator';

export class VoidSupplierPaymentDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
