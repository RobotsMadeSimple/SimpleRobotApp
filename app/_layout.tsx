import { Stack } from "expo-router";
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/global.css';

import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';

export default function Layout() {
  return (
    
    <GluestackUIProvider mode="light">
      <SafeAreaProvider>
        <Stack />
      </SafeAreaProvider>
    </GluestackUIProvider>
  );
}
