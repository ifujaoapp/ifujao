import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeMode } from '@/hooks/use-theme-mode';
import { Colors } from '@/constants/theme';

let LocalAuthentication: typeof import('expo-local-authentication') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  LocalAuthentication = require('expo-local-authentication');
} catch {
  LocalAuthentication = null;
}

const AppLock: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useThemeMode();
  const themeColors = Colors[theme];
  const [locked, setLocked] = useState(true);
  const [available, setAvailable] = useState(true);
  const [checking, setChecking] = useState(true);

  const tryUnlock = useCallback(async () => {
    if (!LocalAuthentication) {
      setLocked(false);
      return;
    }
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloqueie o iFujão',
        fallbackLabel: 'Usar senha do celular',
        disableDeviceFallback: false,
      });
      if (result.success) setLocked(false);
    } catch {
      setLocked(true);
    }
  }, []);

  useEffect(() => {
    if (!LocalAuthentication) {
      setAvailable(false);
      setLocked(false);
      setChecking(false);
      return;
    }
    (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync().catch(() => false);
      const enrolled = await LocalAuthentication.isEnrolledAsync().catch(() => false);
      if (!hasHardware || !enrolled) {
        setAvailable(false);
        setLocked(false);
        setChecking(false);
        return;
      }
      setAvailable(true);
      setChecking(false);
      tryUnlock();
    })();
  }, [tryUnlock]);

  if (!locked) return <>{children}</>;

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {checking ? (
        <ActivityIndicator size="large" color={themeColors.primaryButton} />
      ) : available ? (
        <>
          <Ionicons name="lock-closed" size={56} color={themeColors.primaryButton} />
          <Text style={[styles.title, { color: themeColors.text }]}>iFujão bloqueado</Text>
          <Text style={[styles.subtitle, { color: themeColors.text }]}>
            Use sua biometria ou senha do celular para entrar.
          </Text>
          <TouchableOpacity style={[styles.button, { backgroundColor: themeColors.primaryButton }]} onPress={tryUnlock}>
            <Text style={styles.buttonText}>Desbloquear</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>{children}</>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
  },
  button: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AppLock;
