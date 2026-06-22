import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function ExpansionCitiesPage() {
  return <Phase2DataPage titleKey="expansion.cities" endpoint="/expansion/cities" createEndpoint="/expansion/cities" defaultPayload={{ city: "City", population: 0, estimatedDemand: 0, competitors: 0 }} />;
}
