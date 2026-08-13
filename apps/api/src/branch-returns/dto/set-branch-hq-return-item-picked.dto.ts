import { IsBoolean } from 'class-validator';

export class SetBranchHqReturnItemPickedDto {
  @IsBoolean()
  picked!: boolean;
}
