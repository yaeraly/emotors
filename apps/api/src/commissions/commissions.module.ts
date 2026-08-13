import { Module } from '@nestjs/common';
import { CommissionsController, CompensationController } from './commissions.controller';
import { CommissionsService } from './commissions.service';

@Module({
  controllers: [CommissionsController, CompensationController],
  providers: [CommissionsService],
  exports: [CommissionsService],
})
export class CommissionsModule {}
