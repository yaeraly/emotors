import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { AcademyService } from './academy.service';

@Controller('academy')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.ACADEMY_MANAGER)
export class AcademyController {
  constructor(private readonly academyService: AcademyService) {}

  @Post('courses') createCourse(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.academyService.createCourse(user, dto); }
  @Get('courses') courses() { return this.academyService.courses(); }
  @Post('students') createStudent(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.academyService.createStudent(user, dto); }
  @Get('students') students(@CurrentUser() user: AuthUser) { return this.academyService.students(user); }
  @Post('enrollments') createEnrollment(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.academyService.createEnrollment(user, dto); }
  @Post('certificates') createCertificate(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.academyService.createCertificate(user, dto); }
  @Get('certificates/:id') certificate(@Param('id') id: string) { return this.academyService.certificate(id); }
}
