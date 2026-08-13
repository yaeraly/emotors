import { IsOptional, IsString } from 'class-validator';

export class ApproveHqB2bInstallmentDto {
  @IsOptional()
  @IsString()
  comment?: string;
}
