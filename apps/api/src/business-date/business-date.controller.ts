import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../roles/permissions.decorator';
import { PermissionsGuard } from '../roles/permissions.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { BusinessDateService } from './business-date.service';
import { UpdateBusinessDateDto } from './dto/update-business-date.dto';

@Controller('business-date')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.SYSTEM_ADMINISTRATOR)
@RequirePermissions('businessDate.update.hqAdmin')
export class BusinessDateController {
  constructor(private readonly businessDateService: BusinessDateService) {}

  @Get('allowed-range')
  getAllowedRange() {
    return this.businessDateService.getAllowedRange();
  }

  @Get('supported-entities')
  listSupportedEntities() {
    return this.businessDateService.listSupportedEntities();
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateBusinessDateDto) {
    return this.businessDateService.updateBusinessDate(user, dto);
  }
}
