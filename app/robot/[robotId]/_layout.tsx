import { RobotProvider } from '@/src/providers/RobotStatusProvider';
import { Stack, useLocalSearchParams } from 'expo-router';

export default function RobotLayout() {
  const { robotId } = useLocalSearchParams<{ robotId: string }>();

  return (
    <RobotProvider robotId={robotId}>
      <Stack />
    </RobotProvider>
  );
}
