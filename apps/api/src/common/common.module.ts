import { Global, Module } from '@nestjs/common';
import { BranchAccessService } from './branch-access.service';
import { PermissionsGuard } from './permissions.guard';

@Global()
@Module({
  providers: [BranchAccessService, PermissionsGuard],
  exports: [BranchAccessService, PermissionsGuard],
})
export class CommonModule {}
