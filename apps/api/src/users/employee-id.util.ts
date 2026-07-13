import { Prisma } from '@prisma/client';

export const EMPLOYEE_ID_GENERATION_FAILED = 'Не удалось сформировать уникальный ID сотрудника';

type PrismaTx = Prisma.TransactionClient;

export async function generateBranchEmployeeId(tx: PrismaTx, branchId: string) {
  const branch = await tx.branch.findUnique({
    where: { id: branchId },
    select: { code: true },
  });
  const branchCode = (branch?.code ?? 'BR').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'BR';
  const prefix = `${branchCode}-EMP-`;

  const existing = await tx.user.findMany({
    where: { employeeId: { startsWith: prefix } },
    select: { employeeId: true },
  });

  let maxSequence = 0;
  for (const row of existing) {
    const match = row.employeeId?.match(/-EMP-(\d+)$/);
    if (match) {
      maxSequence = Math.max(maxSequence, Number(match[1]));
    }
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `${prefix}${String(maxSequence + 1 + attempt).padStart(3, '0')}`;
    const taken = await tx.user.findFirst({
      where: { employeeId: candidate },
      select: { id: true },
    });
    if (!taken) {
      return candidate;
    }
  }

  throw new Error(EMPLOYEE_ID_GENERATION_FAILED);
}
