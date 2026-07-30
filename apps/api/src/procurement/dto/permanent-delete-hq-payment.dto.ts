import { IsOptional, IsString } from 'class-validator';

export class PermanentDeleteHqPaymentDto {
  @IsOptional()
  @IsString()
  reason?: string;

  /** Required when deleting a supplier payment from SUPPLIER_INVOICE (order id is in the route). */
  @IsOptional()
  @IsString()
  paymentId?: string;
}
