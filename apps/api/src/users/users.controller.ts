import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.usersService.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.usersService.create(user, dto);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.usersService.detail(user, id);
  }

  @Put(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.usersService.update(user, id, dto);
  }

  @Post(':id/reset-password')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR)
  resetPassword(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.usersService.resetPassword(user, id);
  }

  @Post(':id/activate')
  activate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.usersService.setStatus(user, id, UserStatus.ACTIVE);
  }

  @Post(':id/suspend')
  suspend(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.usersService.setStatus(user, id, UserStatus.SUSPENDED);
  }

  @Get(':id/login-history')
  loginHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.usersService.loginHistory(user, id);
  }
}
