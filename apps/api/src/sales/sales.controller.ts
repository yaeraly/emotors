import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { AddPaymentDto } from './dto/add-payment.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SaleQueryDto } from './dto/sale-query.dto';
import { SalesService } from './sales.service';

@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.MANAGER, Role.ACCOUNTANT)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @Roles(Role.OWNER, Role.MANAGER)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSaleDto) {
    return this.salesService.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: SaleQueryDto) {
    return this.salesService.findAll(user, query);
  }

  @Get('reports/daily')
  dailyReport(@CurrentUser() user: AuthUser, @Query() query: SaleQueryDto) {
    return this.salesService.dailyReport(user, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salesService.findOne(user, id);
  }

  @Post(':id/payments')
  addPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddPaymentDto,
  ) {
    return this.salesService.addPayment(user, id, dto);
  }

  @Get(':id/receipt')
  receipt(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salesService.receipt(user, id);
  }
}
