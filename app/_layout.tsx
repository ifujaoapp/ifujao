import { DarkTheme, DefaultTheme } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { useEffect, useState } from 'react';

import { ThemeProvider as AppThemeProvider, useThemeMode } from '@/hooks/use-theme-mode';
import AppLock from '@/src/components/AppLock';
import { AppAlertProvider } from '@/src/components/AppAlert';
import { BanProvider, useBanContext } from '@/src/components/BanProvider';
import { BannedScreen } from '@/src/components/BannedScreen';
import SplashScreen from '@/components/SplashScreen';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const { theme } = useThemeMode();
  const isDark = theme === 'dark';
  const { isBanned } = useBanContext();

  useEffect(() => {
    NavigationBar.setButtonStyleAsync(isDark ? 'light' : 'dark').catch(() => {});
  }, [isDark]);

  if (isBanned) {
    return (
      <>
        <BannedScreen />
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </>
    );
  }

  return (
    <AppLock>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: isDark ? DarkTheme.colors.card : DefaultTheme.colors.card },
          headerTintColor: isDark ? DarkTheme.colors.text : DefaultTheme.colors.text,
          contentStyle: { backgroundColor: isDark ? DarkTheme.colors.background : DefaultTheme.colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="pet/[id]" options={{ title: 'Pet perdido' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </AppLock>
  );
}

export default function RootLayout() {
  const [isSplashFinished, setIsSplashFinished] = useState(false);

  if (!isSplashFinished) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppThemeProvider>
          <BanProvider>
            <AppAlertProvider>
              <SplashScreen onFinish={() => setIsSplashFinished(true)} />
            </AppAlertProvider>
          </BanProvider>
        </AppThemeProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeProvider>
        <BanProvider>
          <AppAlertProvider>
            <RootLayoutNav />
          </AppAlertProvider>
        </BanProvider>
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}
