import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { BranchQueryDto } from './dto/branch-query.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { AssignBranchHqWarehouseDto } from './dto/assign-branch-hq-warehouse.dto';

@Controller('branches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Post()
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_DIRECTOR)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBranchDto) {
    return this.branchesService.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: BranchQueryDto) {
    return this.branchesService.findAll(user, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.branchesService.findOne(user, id);
  }

  @Put(':id')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_DIRECTOR)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.branchesService.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_DIRECTOR)
  delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.branchesService.delete(user, id);
  }

  @Put(':id/assigned-hq-warehouse')
  @Roles(Role.OWNER, Role.CEO)
  assignHqWarehouse(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssignBranchHqWarehouseDto,
  ) {
    return this.branchesService.assignHqWarehouse(user, id, dto);
  }

  @Get(':id/dashboard')
  dashboard(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.branchesService.dashboard(user, id);
  }
}
