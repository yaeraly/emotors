import { IsOptional, IsString } from 'class-validator';

export class RejectBranchHqReturnDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
