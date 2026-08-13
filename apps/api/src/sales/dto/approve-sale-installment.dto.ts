import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveSaleInstallmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  approvalComment?: string;
}
