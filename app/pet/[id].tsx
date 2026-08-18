import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useThemeMode } from '@/hooks/use-theme-mode';
import { emitDeepLinkPet } from '@/lib/deeplink';

export default function PetDeepLinkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useThemeMode();
  const isDark = theme === 'dark';

  useEffect(() => {
    if (id) emitDeepLinkPet(id as string);
    router.replace('/(tabs)');
  }, [id]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: isDark ? '#000000' : '#F2F2F7',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ActivityIndicator size="large" color={isDark ? '#FFFFFF' : '#0A84FF'} />
    </View>
  );
}
