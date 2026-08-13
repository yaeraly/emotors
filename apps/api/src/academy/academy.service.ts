import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { canAccessAllBranches } from '../rbac/rbac';

@Injectable()
export class AcademyService {
  constructor(private readonly prisma: PrismaService) {}

  createCourse(user: AuthUser, dto: any) {
    return this.prisma.course.create({
      data: {
        title: dto.title,
        description: dto.description,
        durationDays: Number(dto.durationDays ?? 0),
        level: dto.level,
        isActive: dto.isActive ?? true,
        createdById: user.id,
      },
    });
  }

  courses() {
    return this.prisma.course.findMany({ orderBy: { createdAt: 'desc' } });
  }

  createStudent(user: AuthUser, dto: any) {
    const branchId = this.resolveBranchId(user, dto.branchId);
    return this.prisma.student.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        branchId,
        status: dto.status,
        createdById: user.id,
      },
      include: { branch: true },
    });
  }

  students(user: AuthUser) {
    return this.prisma.student.findMany({
      where: canAccessAllBranches(user.role) ? {} : { branchId: user.branchId },
      include: { branch: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  createEnrollment(user: AuthUser, dto: any) {
    return this.prisma.enrollment.create({
      data: {
        courseId: dto.courseId,
        studentId: dto.studentId,
        status: dto.status,
        createdById: user.id,
      },
      include: { course: true, student: true },
    });
  }

  createCertificate(user: AuthUser, dto: any) {
    return this.prisma.certificate.create({
      data: {
        certificateNumber: dto.certificateNumber ?? `CERT-${Date.now()}`,
        courseId: dto.courseId,
        studentId: dto.studentId,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : new Date(),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        level: dto.level,
        createdById: user.id,
      },
      include: { course: true, student: true },
    });
  }

  certificate(id: string) {
    return this.prisma.certificate.findUnique({
      where: { id },
      include: { course: true, student: true },
    });
  }

  private resolveBranchId(user: AuthUser, branchId?: string) {
    if (canAccessAllBranches(user.role)) return branchId ?? user.branchId;
    if (branchId && branchId !== user.branchId) throw new ForbiddenException('Forbidden branch');
    return user.branchId;
  }
}
