import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { StytchProvider } from '@stytch/react-native';
import Constants from 'expo-constants';
import { PostHogProvider } from 'posthog-react-native';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { StytchStateBridge } from '@/components/StytchStateBridge';
import { stytchClient } from '@/lib/stytch';

const posthogKey = Constants.expoConfig?.extra?.POSTHOG_KEY ?? '';
const posthogHost = Constants.expoConfig?.extra?.POSTHOG_HOST ?? 'https://us.i.posthog.com';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <PostHogProvider apiKey={posthogKey} options={{ host: posthogHost }} autocapture>
      <StytchProvider stytch={stytchClient}>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <StytchStateBridge />
          <AnimatedSplashOverlay />
          <AppTabs />
        </ThemeProvider>
      </StytchProvider>
    </PostHogProvider>
  );
}
