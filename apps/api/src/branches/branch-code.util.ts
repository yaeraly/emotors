import { BranchType, Prisma } from '@prisma/client';

export const BRANCH_CODE_GENERATION_FAILED = 'Не удалось сформировать уникальный код филиала';

type PrismaTx = Prisma.TransactionClient;

const PREFIX_BY_TYPE: Record<BranchType, string> = {
  HQ_BRANCH: 'HQ',
  FRANCHISE: 'FR',
  DEALER: 'DLR',
  DISTRIBUTOR: 'DST',
};

export function resolveBranchCodePrefix(branchType: BranchType) {
  return PREFIX_BY_TYPE[branchType] ?? 'BR';
}

export async function generateBranchCode(tx: PrismaTx, branchType: BranchType) {
  const prefix = `${resolveBranchCodePrefix(branchType)}-`;

  const existing = await tx.branch.findMany({
    where: { code: { startsWith: prefix } },
    select: { code: true },
  });

  let maxSequence = 0;
  const sequencePattern = new RegExp(`^${prefix.replace('-', '\\-')}(\\d+)$`);
  for (const row of existing) {
    const match = row.code.match(sequencePattern);
    if (match) {
      maxSequence = Math.max(maxSequence, Number(match[1]));
    }
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `${prefix}${String(maxSequence + 1 + attempt).padStart(3, '0')}`;
    const taken = await tx.branch.findUnique({
      where: { code: candidate },
      select: { id: true },
    });
    if (!taken) {
      return candidate;
    }
  }

  throw new Error(BRANCH_CODE_GENERATION_FAILED);
}
