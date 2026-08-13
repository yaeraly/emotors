import { IsOptional, IsString, MinLength } from 'class-validator';

export class RejectSaleInstallmentDto {
  @IsString()
  @MinLength(1)
  rejectionReason!: string;
}
