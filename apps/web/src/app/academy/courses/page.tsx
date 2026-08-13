import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function CoursesPage() {
  return <Phase2DataPage titleKey="academy.courses" endpoint="/academy/courses" createEndpoint="/academy/courses" defaultPayload={{ title: 'Course title', description: '', durationDays: 5, level: 'BEGINNER' }} />;
}
