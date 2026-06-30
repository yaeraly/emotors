import { Global, Module } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';
import { RolesGuard } from './roles.guard';

@Global()
@Module({
  providers: [RolesGuard, PermissionsGuard],
  exports: [RolesGuard, PermissionsGuard],
})
export class RolesModule {}
