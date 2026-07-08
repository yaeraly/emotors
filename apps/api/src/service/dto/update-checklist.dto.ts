import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateChecklistDto {
  @IsOptional()
  @IsBoolean()
  checklistDiagnostics?: boolean;

  @IsOptional()
  @IsBoolean()
  checklistPartsInstalled?: boolean;

  @IsOptional()
  @IsBoolean()
  checklistTestDrive?: boolean;

  @IsOptional()
  @IsBoolean()
  checklistFinalInspection?: boolean;

  @IsOptional()
  @IsBoolean()
  checklistCustomerInformed?: boolean;

  @IsOptional()
  @IsBoolean()
  oldPartReturned?: boolean;

  @IsOptional()
  customerSignature?: string;
}
