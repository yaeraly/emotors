import { Module } from '@nestjs/common';
import { SalesMotivationController } from './sales-motivation.controller';
import { SalesMotivationService } from './sales-motivation.service';

@Module({
  controllers: [SalesMotivationController],
  providers: [SalesMotivationService],
  exports: [SalesMotivationService],
})
export class SalesMotivationModule {}
