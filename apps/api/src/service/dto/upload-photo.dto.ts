import { IsEnum, IsString, MinLength } from 'class-validator';
import { ServicePhotoType } from '@prisma/client';

export class UploadServicePhotoDto {
  @IsEnum(ServicePhotoType)
  type!: ServicePhotoType;

  @IsString()
  @MinLength(1)
  fileName!: string;

  @IsString()
  @MinLength(1)
  fileUrl!: string;

  @IsString()
  @MinLength(1)
  mimeType!: string;
}
