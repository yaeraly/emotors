import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
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
  autoSave?: boolean;

  @IsOptional()
  networkRecovery?: boolean;
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
}

export class SaveAllChinaReceivingDraftDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveAllChinaReceivingDraftRowDto)
  rows!: SaveAllChinaReceivingDraftRowDto[];
}
