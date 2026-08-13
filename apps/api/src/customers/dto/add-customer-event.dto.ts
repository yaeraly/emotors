import { CustomerEventType } from '@prisma/client';
import { IsEnum, IsString, MinLength } from 'class-validator';

export class AddCustomerEventDto {
  @IsEnum(CustomerEventType)
  type!: CustomerEventType;

  @IsString()
  @MinLength(1)
  message!: string;
}
