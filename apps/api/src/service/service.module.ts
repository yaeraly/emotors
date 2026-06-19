import { Module } from '@nestjs/common';
import { ServiceController } from './service.controller';
import { ServiceOrdersService } from './service-orders.service';

@Module({
  controllers: [ServiceController],
  providers: [ServiceOrdersService],
})
export class ServiceModule {}
