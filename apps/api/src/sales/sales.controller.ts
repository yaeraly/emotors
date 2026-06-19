import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { CreateSaleDto, SalePaymentDto } from './dto';
import { SalesService } from './sales.service';

@Controller('sales')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('SALES')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSaleDto) {
    return this.salesService.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.salesService.list(user);
  }

  @Get('reports/daily')
  dailyReport(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    return this.salesService.dailyReport(user, date);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salesService.findOne(user, id);
  }

  @Post(':id/payments')
  addPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SalePaymentDto,
  ) {
    return this.salesService.addPayment(user, id, dto);
  }
}
