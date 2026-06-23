import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { CustomersService } from './customers.service';
import { AddCustomerEventDto } from './dto/add-customer-event.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: CustomerQueryDto) {
    return this.customersService.findAll(user, query);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(user, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customersService.findOne(user, id);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(user, id, dto);
  }

  @Delete(':id')
  softDelete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customersService.softDelete(user, id);
  }

  @Post(':id/events')
  addEvent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddCustomerEventDto,
  ) {
    return this.customersService.addEvent(user, id, dto);
  }

  @Post(':id/follow-ups')
  addFollowUp(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateFollowUpDto,
  ) {
    return this.customersService.addFollowUp(user, id, dto);
  }

  @Put(':id/follow-ups/:followUpId/done')
  markFollowUpDone(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('followUpId') followUpId: string,
  ) {
    return this.customersService.markFollowUpDone(user, id, followUpId);
  }

  @Get(':id/timeline')
  timeline(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customersService.timeline(user, id);
  }
}
