import { Module } from '@nestjs/common';
import { FranchiseDirectorController } from './franchise-director.controller';
import { FranchiseDirectorService } from './franchise-director.service';

@Module({
  controllers: [FranchiseDirectorController],
  providers: [FranchiseDirectorService],
  exports: [FranchiseDirectorService],
})
export class FranchiseDirectorModule {}
