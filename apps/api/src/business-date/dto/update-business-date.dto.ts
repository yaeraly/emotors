import { IsDateString, IsString, MinLength } from 'class-validator';

export class UpdateBusinessDateDto {
  @IsString()
  entityType!: string;

  @IsString()
  entityId!: string;

  @IsString()
  fieldName!: string;

  @IsDateString()
  newDate!: string;

  @IsString()
  @MinLength(1)
  reason!: string;
}
