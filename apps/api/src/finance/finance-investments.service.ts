import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FinanceLedgerEntryType } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCanAccessAccountScope,
  canCreateOwnerInvestment,
} from './finance-access.util';
import { FinanceLedgerService } from './finance-ledger.service';
import { CreateOwnerInvestmentDto } from './dto/create-owner-investment.dto';

@Injectable()
export class FinanceInvestmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: FinanceLedgerService,
  ) {}

  async createOwnerInvestment(user: AuthUser, dto: CreateOwnerInvestmentDto) {
    if (!canCreateOwnerInvestment(user)) {
      throw new ForbiddenException('Only Branch CEO can create owner investments');
    }

    const account = await this.prisma.financeAccount.findFirst({
      where: { id: dto.accountId, deletedAt: null, status: 'ACTIVE' },
      include: { typeDefinition: true },
    });
    if (!account) throw new NotFoundException('Account not found');
    if (user.branchId && account.branchId && user.branchId !== account.branchId) {
      throw new ForbiddenException('Branch isolation violation');
    }
    assertCanAccessAccountScope(user, account);

    const entryType =
      dto.investmentType === 'CAPITAL_INJECTION'
        ? FinanceLedgerEntryType.CAPITAL_INJECTION
        : FinanceLedgerEntryType.OWNER_INVESTMENT;

    return this.prisma.$transaction(async (tx) => {
      const entry = await this.ledgerService.postLedgerEntry(tx, user, {
        accountId: account.id,
        branchId: account.branchId,
        entryType,
        amount: Number(dto.amount),
        currency: account.currency,
        notes: dto.notes,
        referenceType: 'OwnerInvestment',
      });

      return {
        accountId: account.id,
        accountName: account.name,
        entry,
      };
    });
  }

  async listInvestments(user: AuthUser, branchId?: string) {
    const effectiveBranchId = branchId ?? user.branchId ?? undefined;
    const entries = await this.prisma.financeLedgerEntry.findMany({
      where: {
        entryType: {
          in: [FinanceLedgerEntryType.OWNER_INVESTMENT, FinanceLedgerEntryType.CAPITAL_INJECTION],
        },
        ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
      },
      include: {
        account: { select: { id: true, name: true, accountNumber: true, branchId: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return entries;
  }
}
