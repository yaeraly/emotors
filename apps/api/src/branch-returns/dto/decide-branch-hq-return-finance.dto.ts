import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class DecideBranchHqReturnFinanceDto {
  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}
