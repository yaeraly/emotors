import { ShortageResolutionType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ResolveShortageDto {
  @IsEnum(ShortageResolutionType)
  resolutionType!: ShortageResolutionType;

  @IsOptional()
  @IsString()
  replacementOrderId?: string;

  @IsOptional()
  @IsString()
  nextOrderId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
