import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function StudentsPage() {
  return <Phase2DataPage titleKey="academy.students" endpoint="/academy/students" createEndpoint="/academy/students" defaultPayload={{ fullName: 'Student name', phone: '', branchId: '' }} />;
}
