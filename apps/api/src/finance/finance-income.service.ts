import { Injectable } from '@nestjs/common';
import { FinanceLedgerEntryType } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { resolveFinanceScopeFilter } from './finance-access.util';
import { FinanceReportQueryDto } from './dto/finance-report-query.dto';
import { buildLedgerBusinessDateWhere } from './finance-ledger-business-date.util';

const OPERATING_INCOME_TYPES: FinanceLedgerEntryType[] = [
  FinanceLedgerEntryType.INCOME,
  FinanceLedgerEntryType.PAYMENT,
];

@Injectable()
export class FinanceIncomeService {
  constructor(private readonly prisma: PrismaService) {}

  async listIncome(user: AuthUser, query: FinanceReportQueryDto) {
    const scopeFilter = resolveFinanceScopeFilter(user, query.branchId);
    const businessDateWhere = await buildLedgerBusinessDateWhere(
      this.prisma,
      query.dateFrom,
      query.dateTo,
    );
    return this.prisma.financeLedgerEntry.findMany({
      where: {
        ...(scopeFilter.branchId ? { branchId: scopeFilter.branchId } : {}),
        entryType: { in: OPERATING_INCOME_TYPES },
        ...(businessDateWhere ?? {}),
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
