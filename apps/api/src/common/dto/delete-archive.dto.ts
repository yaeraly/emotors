import { IsOptional, IsString } from 'class-validator';

export class DeleteArchiveDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
