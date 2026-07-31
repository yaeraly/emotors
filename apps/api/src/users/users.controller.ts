import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { CreateBranchOwnerDto } from './dto/create-branch-owner.dto';
import { UpdateBranchOwnerDto } from './dto/update-branch-owner.dto';
import { UsersService } from './users.service';
import { UserPermissionsService } from './user-permissions.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly userPermissionsService: UserPermissionsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('role') role?: string) {
    return this.usersService.list(user, role);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.usersService.create(user, dto);
  }

  @Get('branch-owners')
  @Roles(Role.OWNER, Role.CEO)
  listBranchOwners(@CurrentUser() user: AuthUser) {
    return this.usersService.listBranchOwners(user);
  }

  @Post('branch-owners')
  @Roles(Role.OWNER, Role.CEO)
  createBranchOwner(@CurrentUser() user: AuthUser, @Body() dto: CreateBranchOwnerDto) {
    return this.usersService.createBranchOwner(user, dto);
  }

  @Put('branch-owners/:id')
  @Roles(Role.OWNER, Role.CEO)
  updateBranchOwner(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBranchOwnerDto,
  ) {
    return this.usersService.updateBranchOwner(user, id, dto);
  }

  @Delete('branch-owners/:id')
  @Roles(Role.OWNER, Role.CEO)
  deleteBranchOwner(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.usersService.deleteBranchOwner(user, id);
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
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER)
  resetPassword(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.usersService.resetPassword(user, id);
  }

  @Post(':id/create-login')
  @Roles(Role.OWNER, Role.CEO)
  createLogin(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.usersService.createLogin(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.CEO)
  removeEmployee(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto?: { reason?: string },
  ) {
    return this.usersService.removeEmployee(user, id, dto?.reason);
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

  @Get(':id/permissions/cashier')
  getCashierPermission(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.userPermissionsService.getCashierCapabilityStatus(user, id);
  }

  @Post(':id/permissions/cashier/grant')
  @Roles(Role.FRANCHISE_OWNER)
  grantCashierPermission(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.userPermissionsService.grantCashierCapability(user, id);
  }

  @Post(':id/permissions/cashier/revoke')
  @Roles(Role.FRANCHISE_OWNER)
  revokeCashierPermission(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.userPermissionsService.revokeCashierCapability(user, id);
  }
}
