import { Module } from '@nestjs/common';
import { DevAdminController } from './dev-admin.controller';
import { DevAdminService } from './dev-admin.service';

@Module({
  controllers: [DevAdminController],
  providers: [DevAdminService],
})
export class DevAdminModule {}
