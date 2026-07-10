import { IsArray, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SaveChinaReceivingDraftRowDto {
  @IsInt()
  @Min(0)
  actualQuantity!: number;

  @IsInt()
  @Min(0)
  damagedQuantity!: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitWeightKg?: number;

  @IsOptional()
  autoSave?: boolean;

  @IsOptional()
  networkRecovery?: boolean;

  @IsOptional()
  @IsString()
  expectedUpdatedAt?: string;
}

export class SaveAllChinaReceivingDraftRowDto {
  @IsString()
  procurementItemId!: string;

  @IsInt()
  @Min(0)
  actualQuantity!: number;

  @IsInt()
  @Min(0)
  damagedQuantity!: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitWeightKg?: number;
}

export class SaveAllChinaReceivingDraftDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveAllChinaReceivingDraftRowDto)
  rows!: SaveAllChinaReceivingDraftRowDto[];
}
