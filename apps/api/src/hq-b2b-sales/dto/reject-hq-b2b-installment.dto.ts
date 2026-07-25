import { IsString, MinLength } from 'class-validator';

export class RejectHqB2bInstallmentDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
