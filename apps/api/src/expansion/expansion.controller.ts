import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { ExpansionService } from './expansion.service';

@Controller('expansion')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.EXPANSION_MANAGER)
export class ExpansionController {
  constructor(private readonly service: ExpansionService) {}
  @Post('cities') createCity(@Body() dto: any) { return this.service.createCity(dto); }
  @Get('cities') cities() { return this.service.cities(); }
  @Post('locations') createLocation(@Body() dto: any) { return this.service.createLocation(dto); }
  @Get('locations') locations() { return this.service.locations(); }
  @Post('applications') createApplication(@Body() dto: any) { return this.service.createApplication(dto); }
  @Get('applications') applications() { return this.service.applications(); }
  @Post('applications/:id/approve') approve(@Param('id') id: string, @Body() dto: any) { return this.service.approveApplication(id, dto); }
}
