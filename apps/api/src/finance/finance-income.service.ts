import { Injectable } from '@nestjs/common';
import { FinanceLedgerEntryType } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { resolveFinanceScopeFilter } from './finance-access.util';
import { FinanceReportQueryDto } from './dto/finance-report-query.dto';

const OPERATING_INCOME_TYPES: FinanceLedgerEntryType[] = [
  FinanceLedgerEntryType.INCOME,
  FinanceLedgerEntryType.PAYMENT,
];

@Injectable()
export class FinanceIncomeService {
  constructor(private readonly prisma: PrismaService) {}

  async listIncome(user: AuthUser, query: FinanceReportQueryDto) {
    const scopeFilter = resolveFinanceScopeFilter(user, query.branchId);
    return this.prisma.financeLedgerEntry.findMany({
      where: {
        ...(scopeFilter.branchId ? { branchId: scopeFilter.branchId } : {}),
        entryType: { in: OPERATING_INCOME_TYPES },
        ...(query.dateFrom || query.dateTo
          ? {
              createdAt: {
                ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
                ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
              },
            }
          : {}),
      },
      include: {
        account: { select: { id: true, name: true, accountNumber: true, currency: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 200,
    });
  }
}
