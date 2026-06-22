import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function PayrollPage() {
  return (
    <Phase2DataPage
      titleKey="payroll.title"
      endpoint="/payroll"
      createEndpoint="/payroll/generate"
      defaultPayload={{
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        branchId: '',
        deductions: 0,
      }}
    />
  );
}
