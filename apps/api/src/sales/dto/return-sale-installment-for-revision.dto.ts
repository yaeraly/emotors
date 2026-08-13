import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReturnSaleInstallmentForRevisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  revisionComment?: string;
}
