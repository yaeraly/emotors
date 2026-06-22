import { IsOptional, IsString } from 'class-validator';

export class DistributionReportQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;
}
