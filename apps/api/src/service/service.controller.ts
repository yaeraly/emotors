import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Role, ServiceOrderStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { AddDiagnosisDto } from './dto/add-diagnosis.dto';
import { AddPartsDto } from './dto/add-parts.dto';
import { AddRepairDto } from './dto/add-repair.dto';
import { CompleteServiceOrderDto } from './dto/complete-service-order.dto';
import { CreatePartsRequestDto, IssuePartsRequestDto } from './dto/create-parts-request.dto';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { ReceiveServicePaymentDto } from './dto/receive-payment.dto';
import { ServiceCustomerSearchDto, ServiceProductSearchDto } from './dto/service-search.dto';
import { SetLaborCostDto } from './dto/set-labor-cost.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { UploadServicePhotoDto } from './dto/upload-photo.dto';
import { ServiceService } from './service.service';

const SERVICE_READ_ROLES = [
  Role.OWNER,
  Role.CEO,
  Role.SYSTEM_ADMINISTRATOR,
  Role.FRANCHISE_OWNER,
  Role.MASTER,
  Role.CASHIER,
  Role.WAREHOUSE_OPERATOR,
] as const;

const SERVICE_WRITE_ROLES = [
  Role.OWNER,
  Role.CEO,
  Role.SYSTEM_ADMINISTRATOR,
  Role.FRANCHISE_OWNER,
  Role.MASTER,
] as const;

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...SERVICE_READ_ROLES)
@Controller()
export class ServiceController {
  constructor(private readonly serviceService: ServiceService) {}

  @Post('service-orders')
  @Roles(...SERVICE_WRITE_ROLES)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateServiceOrderDto) {
    return this.serviceService.create(user, dto);
  }

  @Get('service-orders')
  list(
    @CurrentUser() user: AuthUser,
    @Query('branchId') branchId?: string,
    @Query('status') status?: ServiceOrderStatus,
  ) {
    return this.serviceService.list(user, branchId, status);
  }

  @Get('service-orders/masters')
  masters(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.serviceService.masters(user, branchId);
  }

  @Get('service-orders/customer-search')
  @Roles(...SERVICE_WRITE_ROLES)
  searchCustomers(@CurrentUser() user: AuthUser, @Query() query: ServiceCustomerSearchDto) {
    return this.serviceService.searchCustomers(user, query);
  }

  @Get('service-orders/product-search')
  @Roles(...SERVICE_WRITE_ROLES, Role.WAREHOUSE_OPERATOR)
  searchProducts(@CurrentUser() user: AuthUser, @Query() query: ServiceProductSearchDto) {
    return this.serviceService.searchProducts(user, query);
  }

  @Get('service-orders/reports/daily')
  dailyReport(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.serviceService.dailyReport(user, branchId);
  }

  @Get('service-orders/kpi')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER, Role.MASTER)
  masterKpi(@CurrentUser() user: AuthUser, @Query('masterId') masterId?: string) {
    return this.serviceService.masterKpi(user, masterId);
  }

  @Get('service-orders/parts-requests')
  @Roles(...SERVICE_READ_ROLES)
  listPartsRequests(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.serviceService.listPartsRequests(user, branchId);
  }

  @Get('service-orders/customers/:customerId/history')
  serviceHistory(@CurrentUser() user: AuthUser, @Param('customerId') customerId: string) {
    return this.serviceService.serviceHistory(user, customerId);
  }

  @Get('service-orders/:id/receipt')
  receipt(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.serviceService.receipt(user, id);
  }

  @Get('service-orders/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.serviceService.detail(user, id);
  }

  @Put('service-orders/:id')
  @Roles(...SERVICE_WRITE_ROLES)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<CreateServiceOrderDto>,
  ) {
    return this.serviceService.update(user, id, dto);
  }

  @Post('service-orders/:id/labor-cost')
  @Roles(...SERVICE_WRITE_ROLES)
  setLaborCost(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetLaborCostDto,
  ) {
    return this.serviceService.setLaborCost(user, id, dto);
  }

  @Post('service-orders/:id/diagnosis')
  @Roles(...SERVICE_WRITE_ROLES)
  addDiagnosis(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddDiagnosisDto) {
    return this.serviceService.addDiagnosis(user, id, dto);
  }

  @Post('service-orders/:id/repairs')
  @Roles(...SERVICE_WRITE_ROLES)
  addRepair(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddRepairDto) {
    return this.serviceService.addRepair(user, id, dto);
  }

  @Post('service-orders/:id/parts')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER, Role.WAREHOUSE_OPERATOR, Role.WAREHOUSE_MANAGER)
  addParts(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddPartsDto) {
    return this.serviceService.addParts(user, id, dto);
  }

  @Post('service-orders/:id/parts-requests')
  @Roles(...SERVICE_WRITE_ROLES)
  createPartsRequest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreatePartsRequestDto,
  ) {
    return this.serviceService.createPartsRequest(user, id, dto);
  }

  @Post('service-orders/:id/parts-requests/:requestId/submit')
  @Roles(...SERVICE_WRITE_ROLES)
  submitPartsRequest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('requestId') requestId: string,
  ) {
    return this.serviceService.submitPartsRequest(user, id, requestId);
  }

  @Post('service-orders/parts-requests/:requestId/issue')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER, Role.WAREHOUSE_OPERATOR, Role.WAREHOUSE_MANAGER)
  issuePartsRequest(
    @CurrentUser() user: AuthUser,
    @Param('requestId') requestId: string,
    @Body() dto: IssuePartsRequestDto,
  ) {
    return this.serviceService.issuePartsRequest(user, requestId, dto);
  }

  @Post('service-orders/parts-requests/:requestId/reject')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER, Role.WAREHOUSE_OPERATOR, Role.WAREHOUSE_MANAGER)
  rejectPartsRequest(
    @CurrentUser() user: AuthUser,
    @Param('requestId') requestId: string,
    @Body('note') note?: string,
  ) {
    return this.serviceService.rejectPartsRequest(user, requestId, note);
  }

  @Post('service-orders/parts-requests/:requestId/waiting-stock')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER, Role.WAREHOUSE_OPERATOR, Role.WAREHOUSE_MANAGER)
  markPartsRequestWaitingStock(
    @CurrentUser() user: AuthUser,
    @Param('requestId') requestId: string,
    @Body('note') note?: string,
  ) {
    return this.serviceService.markPartsRequestWaitingStock(user, requestId, note);
  }

  @Put('service-orders/:id/checklist')
  @Roles(...SERVICE_WRITE_ROLES)
  updateChecklist(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateChecklistDto,
  ) {
    return this.serviceService.updateChecklist(user, id, dto);
  }

  @Post('service-orders/:id/photos')
  @Roles(...SERVICE_WRITE_ROLES)
  uploadPhoto(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UploadServicePhotoDto,
  ) {
    return this.serviceService.uploadPhoto(user, id, dto);
  }

  @Post('service-orders/:id/ready-for-payment')
  @Roles(...SERVICE_WRITE_ROLES)
  readyForPayment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.serviceService.readyForPayment(user, id);
  }

  @Post('service-orders/:id/payment')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER, Role.CASHIER)
  receivePayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReceiveServicePaymentDto,
  ) {
    return this.serviceService.receivePayment(user, id, dto);
  }

  @Post('service-orders/:id/complete')
  @Roles(...SERVICE_WRITE_ROLES)
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CompleteServiceOrderDto,
  ) {
    return this.serviceService.complete(user, id, dto);
  }

  @Post('service-orders/:id/cancel')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.serviceService.cancel(user, id);
  }

  @Get('warranties')
  warranties(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.serviceService.warranties(user, branchId);
  }

  @Get('warranties/:id')
  warranty(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.serviceService.warranty(user, id);
  }
}
