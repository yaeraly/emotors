import { Module } from '@nestjs/common';
import { HqWarehouseModule } from '../hq-warehouse/hq-warehouse.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [HqWarehouseModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
