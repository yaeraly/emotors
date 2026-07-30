import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import {
  runDevDatabaseCleanup,
  verifyDevDatabaseCleanup,
} from './operational-cleanup.util';
import { assertCanPermanentDeleteBusinessData, auditPermanentDelete } from '../rbac/permanent-delete.util';

@Injectable()
export class DevAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async cleanupOperationalData(user: AuthUser) {
    assertCanPermanentDeleteBusinessData(user);
    const result = await runDevDatabaseCleanup(this.prisma);
    await auditPermanentDelete(this.prisma, user, 'DevDatabaseCleanup', 'operational', {
      deletedModels: Object.keys(result.deleted).length,
      resetModels: Object.keys(result.reset).length,
    });
    const verification = await verifyDevDatabaseCleanup(this.prisma);
    return { ...result, verification };
  }

  async verifyOperationalCleanup(user: AuthUser) {
    assertCanPermanentDeleteBusinessData(user);
    return verifyDevDatabaseCleanup(this.prisma);
  }
}
