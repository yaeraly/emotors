import { IsBoolean } from 'class-validator';

export class SetDistributionOrderItemPickedDto {
  @IsBoolean()
  picked!: boolean;
}
