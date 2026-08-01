import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { FastifyReply } from 'fastify';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { CustomerPriceListService } from './customer-price-list.service';

const PRICE_LIST_ROLES = [
  Role.OWNER,
  Role.CEO,
  Role.SYSTEM_ADMINISTRATOR,
  Role.FRANCHISE_OWNER,
  Role.MANAGER,
] as const;

@Controller('customer-price-lists')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...PRICE_LIST_ROLES)
export class CustomerPriceListController {
  constructor(private readonly customerPriceListService: CustomerPriceListService) {}

  @Get('customers/search')
  searchCustomers(@CurrentUser() user: AuthUser, @Query('search') search?: string) {
    return this.customerPriceListService.searchCustomers(user, search);
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser, @Query('customerId') customerId?: string) {
    return this.customerPriceListService.history(user, customerId);
  }

  @Post('customers/:customerId/preview')
  preview(@CurrentUser() user: AuthUser, @Param('customerId') customerId: string) {
    return this.customerPriceListService.preview(user, customerId);
  }

  @Post('customers/:customerId/generate')
  generate(@CurrentUser() user: AuthUser, @Param('customerId') customerId: string) {
    return this.customerPriceListService.generate(user, customerId);
  }

  @Get(':priceListId/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('priceListId') priceListId: string,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.customerPriceListService.download(user, priceListId);
    reply
      .header('Content-Type', file.contentType)
      .header('Content-Disposition', `attachment; filename="${file.fileName}"`);
    return reply.send(file.stream);
  }

  @Post(':priceListId/whatsapp')
  openWhatsApp(@CurrentUser() user: AuthUser, @Param('priceListId') priceListId: string) {
    return this.customerPriceListService.openWhatsApp(user, priceListId);
  }
}
