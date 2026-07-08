import { IsOptional } from 'class-validator';

export class CompleteServiceOrderDto {
  @IsOptional()
  customerSignature?: string;
}
