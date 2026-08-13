import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function CommissionsPage() {
  return (
    <Phase2DataPage
      titleKey="commissions.title"
      endpoint="/commissions/rules"
      createEndpoint="/commissions/rules"
      defaultPayload={{
        branchId: '',
        employeeId: '',
        role: 'SALESPERSON',
        fixedSalary: 0,
        salesCommissionPercent: 5,
        repairCommissionPercent: 30,
        partsCommissionPercent: 0,
        bonusPercent: 0,
      }}
    />
  );
}
