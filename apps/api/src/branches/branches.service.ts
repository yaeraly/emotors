import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: AuthUser) {
    if (user.role === Role.OWNER) {
      return this.prisma.branch.findMany({
        orderBy: { name: 'asc' },
      });
    }

    return this.prisma.branch.findMany({
      where: { id: user.branchId },
      orderBy: { name: 'asc' },
    });
  }
}
