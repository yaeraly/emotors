import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

export class CompleteServiceOrderDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  warrantyUntil?: Date;
}
