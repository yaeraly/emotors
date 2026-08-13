import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function ExpansionApplicationsPage() {
  return <Phase2DataPage titleKey="expansion.applications" endpoint="/expansion/applications" createEndpoint="/expansion/applications" defaultPayload={{ fullName: "Applicant", phone: "", city: "" }} />;
}
