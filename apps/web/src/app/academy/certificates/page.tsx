import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function CertificatesPage() {
  return <Phase2DataPage titleKey="academy.certificates" endpoint="/academy/students" createEndpoint="/academy/certificates" defaultPayload={{ courseId: '', studentId: '', level: 'BEGINNER' }} />;
}
