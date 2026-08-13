import { Module } from '@nestjs/common';
import { HqWarehouseModule } from '../hq-warehouse/hq-warehouse.module';
import { UsersController } from './users.controller';
import { UserPermissionsService } from './user-permissions.service';
import { UsersService } from './users.service';

@Module({
  imports: [HqWarehouseModule],
  controllers: [UsersController],
  providers: [UsersService, UserPermissionsService],
  exports: [UsersService, UserPermissionsService],
})
export class UsersModule {}
