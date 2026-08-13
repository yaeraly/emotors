import { IsNotEmpty, IsString } from 'class-validator';

export class UnlockProcurementOrderDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
