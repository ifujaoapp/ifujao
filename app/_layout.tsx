import { DarkTheme, DefaultTheme } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { useEffect } from 'react';

import { ThemeProvider as AppThemeProvider, useThemeMode } from '@/hooks/use-theme-mode';
import AppLock from '@/src/components/AppLock';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const { theme } = useThemeMode();
  const isDark = theme === 'dark';

  useEffect(() => {
    NavigationBar.setButtonStyleAsync(isDark ? 'light' : 'dark').catch(() => {});
  }, [isDark]);

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
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </AppLock>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeProvider>
        <RootLayoutNav />
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}
