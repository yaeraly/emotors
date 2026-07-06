import { IsString, MinLength } from 'class-validator';

export class AssignHqWarehouseManagerDto {
  @IsString()
  @MinLength(1)
  userId!: string;
}
