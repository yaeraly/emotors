import { Module } from '@nestjs/common';
import { BusinessDateController } from './business-date.controller';
import { BusinessDateService } from './business-date.service';

@Module({
  controllers: [BusinessDateController],
  providers: [BusinessDateService],
  exports: [BusinessDateService],
})
export class BusinessDateModule {}
