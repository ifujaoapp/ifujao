import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeMode } from '@/hooks/use-theme-mode';

export type AppAlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type AlertType = 'error' | 'warning' | 'success' | 'info' | 'location' | 'permission' | 'trash' | 'share' | 'search' | 'exit';

type AlertConfig = {
  type: AlertType;
  title: string;
  message: string;
  buttons: AppAlertButton[];
};

const ICON_MAP: Record<AlertType, { name: any; color: string }> = {
  error: { name: 'alert-circle', color: '#FF3B30' },
  warning: { name: 'warning', color: '#FF9500' },
  success: { name: 'checkmark-circle', color: '#34C759' },
  info: { name: 'information-circle', color: '#0A84FF' },
  location: { name: 'location', color: '#0A84FF' },
  permission: { name: 'lock-closed', color: '#FF9500' },
  trash: { name: 'trash', color: '#FF3B30' },
  share: { name: 'share-social', color: '#0A84FF' },
  search: { name: 'search', color: '#0A84FF' },
  exit: { name: 'log-out', color: '#8E8E93' },
};

let showFn: ((config: AlertConfig) => void) | null = null;

export function AppAlertProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useThemeMode();
  const isDark = theme === 'dark';
  const [config, setConfig] = useState<AlertConfig | null>(null);

  const close = useCallback((btn?: AppAlertButton) => {
    setConfig(null);
    btn?.onPress?.();
  }, []);

  useEffect(() => {
    showFn = (c: AlertConfig) => setConfig(c);
    return () => {
      showFn = null;
    };
  }, []);

  const palette = {
    overlay: 'rgba(0,0,0,0.45)',
    card: isDark ? '#1C1C1E' : '#FFFFFF',
    title: isDark ? '#FFFFFF' : '#000000',
    message: isDark ? '#AEAEB2' : '#3C3C43',
    cancel: isDark ? '#8E8E93' : '#8E8E93',
    default: '#0A84FF',
    destructive: '#FF3B30',
    border: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
  };

  return (
    <View style={{ flex: 1 }}>
      {children}
      <Modal visible={!!config} transparent animationType="fade" onRequestClose={() => config && close(config.buttons.find((b) => b.style === 'cancel') ?? config.buttons[0])}>
        {config && (
          <View style={[styles.overlay, { backgroundColor: palette.overlay }]}>
            <View style={[styles.card, { backgroundColor: palette.card }]}>
              <Ionicons name={ICON_MAP[config.type].name} size={44} color={ICON_MAP[config.type].color} style={styles.icon} />
              <Text style={[styles.title, { color: palette.title }]}>{config.title}</Text>
              {config.message ? <Text style={[styles.message, { color: palette.message }]}>{config.message}</Text> : null}
              <View style={[styles.actions, config.buttons.length > 2 && styles.actionsColumn]}>
                {config.buttons.map((btn, i) => {
                  const color =
                    btn.style === 'destructive' ? palette.destructive : btn.style === 'cancel' ? palette.cancel : palette.default;
                  return (
                    <TouchableOpacity
                      key={`${btn.text}-${i}`}
                      style={[styles.actionBtn, config.buttons.length > 2 && styles.actionBtnColumn]}
                      onPress={() => close(btn)}
                      activeOpacity={0.6}
                    >
                      <Text style={[styles.actionText, { color }]}>{btn.text}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

function resolveType(typeOrTitle: AlertType | string): AlertType {
  const map: Record<string, AlertType> = {
    error: 'error',
    warning: 'warning',
    success: 'success',
    info: 'info',
    location: 'location',
    permission: 'permission',
    trash: 'trash',
    share: 'share',
    search: 'search',
    exit: 'exit',
  };
  return map[typeOrTitle] ?? 'info';
}

export function showAlert(
  type: AlertType | string,
  title: string,
  message?: string,
  buttons?: AppAlertButton[]
) {
  if (!showFn) {
    return;
  }
  showFn({
    type: resolveType(type),
    title,
    message: message ?? '',
    buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
  });
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  icon: {
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 6,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
  },
  actions: {
    flexDirection: 'row',
    width: '100%',
    borderTopWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    marginTop: 4,
  },
  actionsColumn: {
    flexDirection: 'column',
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionBtnColumn: {
    flex: 0,
    width: '100%',
    borderTopWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  actionText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
