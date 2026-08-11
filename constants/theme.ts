import { Platform } from 'react-native';

const tintColorLight = '#007AFF';
const tintColorDark = '#0A84FF';

export const Colors = {
  light: {
    text: '#000000',
    background: '#F2F2F7',
    tint: tintColorLight,
    icon: '#6E6E73',
    tabIconDefault: '#6E6E73',
    tabIconSelected: tintColorLight,
    card: '#FFFFFF',
    cardStroke: '#E5E5EA',
    destructive: '#FF3B30',
    primaryButton: '#007AFF',
    secondaryButton: '#E5E5EA',
    secondaryButtonText: '#000000',
  },
  dark: {
    text: '#FFFFFF',
    background: '#000000',
    tint: tintColorDark,
    icon: '#98989D',
    tabIconDefault: '#98989D',
    tabIconSelected: tintColorDark,
    card: '#1C1C1E',
    cardStroke: '#38383A',
    destructive: '#FF453A',
    primaryButton: '#0A84FF',
    secondaryButton: '#2C2C2E',
    secondaryButtonText: '#FFFFFF',
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'System',
    serif: 'Times New Roman',
    rounded: 'System',
    mono: 'Menlo',
  },
  default: {
    sans: 'sans-serif',
    serif: 'serif',
    rounded: 'sans-serif-condensed',
    mono: 'monospace',
  },
});
