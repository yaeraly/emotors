import { Type } from 'class-transformer';
import { IsDate, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateYuanRateDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rate!: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveFrom?: Date;
}
