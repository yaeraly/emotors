import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function CompensationRulesPage() {
  return (
    <Phase2DataPage
      titleKey="compensation.rules"
      endpoint="/compensation/rules"
      createEndpoint="/compensation/rules"
      defaultPayload={{
        branchId: '',
        employeeId: '',
        role: 'MASTER',
        fixedSalary: 0,
        repairCommissionPercent: 30,
        partsCommissionPercent: 0,
        salesCommissionPercent: 0,
        isActive: true,
      }}
    />
  );
}
