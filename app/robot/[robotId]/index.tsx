import { Button } from '@/components/ui/button';
import { getSelectedRobot } from '@/src/connections/robotState';
import { useRobotStatus } from '@/src/providers/RobotStatusProvider';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';


export default function RobotPage() {
  const { robotId } = useLocalSearchParams<{ robotId: string }>();
  const robot = getSelectedRobot();
  const robotStatus = useRobotStatus();

  if (!robot) {
    return (
      <View style={styles.center}>
        <Text>Robot not found</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Robot Home" }} />
      <View style={styles.container}>
        <Text style={styles.title}>{robot.robotName}</Text>
        <Text style={styles.subtitle}>
            {robot.robotType} · {robot.ipAddress}:{robot.port}
        </Text>

        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: robotStatus.connected ? '#22c55e' : '#ef4444' },
            ]}
          />
          <Text style={styles.statusText}>
            {robotStatus.connected ? 'Connected' : 'Disconnected'}
          </Text>
        </View>

        <View style={styles.section}>
            <Button variant="outline" onPress={() => router.push(`/robot/${robotId}/jog`)}>
            Jog
            </Button>

            <Button variant="outline" onPress={() => router.push(`/robot/${robotId}/points`)}>
            Points
            </Button>

            <Button variant="outline" onPress={() => router.push(`/robot/${robotId}/locals`)}>
            Locals
            </Button>
        </View>
      </View>
    </>
    
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    opacity: 0.7,
  },
  section: {
    gap: 12,
    marginTop: 24,
  },
  statusRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
},
statusDot: {
  width: 10,
  height: 10,
  borderRadius: 5,
},
statusText: {
  fontSize: 14,
  opacity: 0.9,
},

});
