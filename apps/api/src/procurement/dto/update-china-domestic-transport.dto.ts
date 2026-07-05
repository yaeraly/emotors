import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateChinaDomesticTransportDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  chinaDomesticTransportYuan?: number;

  @IsOptional()
  @IsString()
  chinaDomesticTransportCompanyId?: string | null;

  @IsOptional()
  @IsString()
  changeReason?: string;
}
