import { BadRequestException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import {
  getTestDataCleanupCounts,
  runCategoryTestDataCleanup,
  runDevDatabaseCleanup,
  verifyDevDatabaseCleanup,
} from './operational-cleanup.util';
import { assertCanPermanentDeleteBusinessData, auditPermanentDelete } from '../rbac/permanent-delete.util';
import {
  ALL_TEST_DATA_CONFIRMATION,
  TEST_DATA_CLEANUP_CATEGORIES,
  type TestDataCleanupCategory,
} from './test-data-cleanup.categories';

export type TestDataCleanupDto = {
  category: TestDataCleanupCategory;
  reason: string;
  confirmation?: string;
};

@Injectable()
export class DevAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getTestDataCounts(user: AuthUser) {
    assertCanPermanentDeleteBusinessData(user);
    const counts = await getTestDataCleanupCounts(this.prisma);
    return { counts, categories: TEST_DATA_CLEANUP_CATEGORIES };
  }

  async cleanupTestData(user: AuthUser, dto: TestDataCleanupDto) {
    assertCanPermanentDeleteBusinessData(user);

    if (!dto.reason?.trim()) {
      throw new BadRequestException({ message: 'Reason is required', code: 'REASON_REQUIRED' });
    }

    if (!TEST_DATA_CLEANUP_CATEGORIES.includes(dto.category)) {
      throw new BadRequestException({ message: 'Invalid cleanup category', code: 'INVALID_CATEGORY' });
    }

    if (dto.category === 'all') {
      if (dto.confirmation !== ALL_TEST_DATA_CONFIRMATION) {
        throw new BadRequestException({
          message: `Confirmation must be exactly: ${ALL_TEST_DATA_CONFIRMATION}`,
          code: 'CONFIRMATION_REQUIRED',
        });
      }
    }

    let deleted: Record<string, number>;

    if (dto.category === 'all') {
      const result = await runDevDatabaseCleanup(this.prisma);
      deleted = { ...result.deleted, ...result.reset };
    } else {
      deleted = await runCategoryTestDataCleanup(this.prisma, dto.category, {
        excludeUserId: user.id,
      });
    }

    await auditPermanentDelete(this.prisma, user, 'TestDataCleanup', dto.category, {
      reason: dto.reason.trim(),
      category: dto.category,
      deleted,
    });

    const counts = await getTestDataCleanupCounts(this.prisma);
    return { deleted, counts };
  }

  async cleanupOperationalData(user: AuthUser) {
    assertCanPermanentDeleteBusinessData(user);
    return this.cleanupOperationalDataInternal(user, 'operational cleanup');
  }

  private async cleanupOperationalDataInternal(user: AuthUser, reason: string) {
    const result = await runDevDatabaseCleanup(this.prisma);
    await auditPermanentDelete(this.prisma, user, 'DevDatabaseCleanup', 'operational', {
      reason,
      deletedModels: Object.keys(result.deleted).length,
      resetModels: Object.keys(result.reset).length,
    });
    const verification = await verifyDevDatabaseCleanup(this.prisma);
    return { ...result.deleted, ...result.reset, verification };
  }

  async verifyOperationalCleanup(user: AuthUser) {
    assertCanPermanentDeleteBusinessData(user);
    return verifyDevDatabaseCleanup(this.prisma);
  }
}
