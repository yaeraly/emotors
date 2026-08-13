import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AlertStatus, NotificationModule } from '@prisma/client';

export class NotificationQueryDto {
  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;

  @IsOptional()
  @IsEnum(NotificationModule)
  module?: NotificationModule;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  includeArchived?: string;
}
