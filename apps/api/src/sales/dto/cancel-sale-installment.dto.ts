import { IsString, MinLength } from 'class-validator';

export class CancelSaleInstallmentDto {
  @IsString()
  @MinLength(1)
  cancellationReason!: string;
}
