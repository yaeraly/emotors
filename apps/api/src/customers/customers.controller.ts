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
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { CustomersService } from './customers.service';
import {
  CreateCustomerDto,
  CustomerEventDto,
  FollowUpDto,
  UpdateCustomerDto,
} from './dto';

@Controller('customers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('CRM')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('search') search?: string) {
    return this.customersService.list(user, search);
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
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customersService.remove(user, id);
  }

  @Post(':id/events')
  addEvent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CustomerEventDto,
  ) {
    return this.customersService.addEvent(user, id, dto);
  }

  @Post(':id/follow-ups')
  addFollowUp(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: FollowUpDto,
  ) {
    return this.customersService.addFollowUp(user, id, dto);
  }

  @Get(':id/timeline')
  timeline(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customersService.timeline(user, id);
  }
}
