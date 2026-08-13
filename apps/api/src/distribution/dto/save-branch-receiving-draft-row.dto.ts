import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SaveBranchReceivingDraftRowDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  acceptedQuantity!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  damagedQuantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  missingQuantity?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  expectedUpdatedAt?: string;
}
