import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../roles/roles.guard';
import { Roles } from '../roles/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { DevAdminService, type TestDataCleanupDto } from './dev-admin.service';

@Controller('dev-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SYSTEM_ADMINISTRATOR)
export class DevAdminController {
  constructor(private readonly service: DevAdminService) {}

  @Get('test-data-cleanup/counts')
  getTestDataCounts(@CurrentUser() user: AuthUser) {
    return this.service.getTestDataCounts(user);
  }

  @Post('test-data-cleanup')
  cleanupTestData(@CurrentUser() user: AuthUser, @Body() dto: TestDataCleanupDto) {
    return this.service.cleanupTestData(user, dto);
  }

  @Post('operational-cleanup')
  cleanupOperationalData(@CurrentUser() user: AuthUser) {
    return this.service.cleanupOperationalData(user);
  }

  @Get('operational-cleanup/verify')
  verifyOperationalCleanup(@CurrentUser() user: AuthUser) {
    return this.service.verifyOperationalCleanup(user);
  }
}
