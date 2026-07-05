import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateLocalTransportDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  localTransportKgs?: number;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsString()
  changeReason?: string;
}
