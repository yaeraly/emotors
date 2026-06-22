import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateServiceOrderDto {
  @IsString()
  @MinLength(1)
  customerId!: string;

  @IsString()
  @MinLength(1)
  masterId!: string;

  @IsString()
  @MinLength(1)
  problemDescription!: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}
