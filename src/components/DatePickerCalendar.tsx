import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  isVisible: boolean;
  initialDate?: Date | null;
  maximumDate?: Date;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
};

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function DatePickerCalendar({ isVisible, initialDate, maximumDate, onConfirm, onCancel }: Props) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const base = initialDate ? startOfDay(initialDate) : startOfDay(new Date());
  const max = maximumDate ? startOfDay(maximumDate) : null;
  const [view, setView] = useState({ year: base.getFullYear(), month: base.getMonth() });

  const firstWeekday = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.year, view.month, d));

  const canGoPrev =
    !max || new Date(view.year, view.month - 1, 1) >= new Date(max.getFullYear(), max.getMonth(), 1);
  const canGoNext = true;

  const theme = {
    overlay: 'rgba(0,0,0,0.45)',
    card: isDark ? '#1C1C1E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#000000',
    sub: isDark ? '#8E8E93' : '#6E6E73',
    border: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
    selectedBg: '#0A84FF',
    disabled: isDark ? '#3A3A3C' : '#E5E5EA',
  };

  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.navBtn}
              disabled={!canGoPrev}
              onPress={() => canGoPrev && setView({ year: view.month === 0 ? view.year - 1 : view.year, month: view.month === 0 ? 11 : view.month - 1 })}
            >
              <Ionicons name="chevron-back" size={24} color={canGoPrev ? theme.text : theme.disabled} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: theme.text }]}>{MONTHS[view.month]} {view.year}</Text>
            <TouchableOpacity
              style={styles.navBtn}
              disabled={!canGoNext}
              onPress={() => canGoNext && setView({ year: view.month === 11 ? view.year + 1 : view.year, month: view.month === 11 ? 0 : view.month + 1 })}
            >
              <Ionicons name="chevron-forward" size={24} color={canGoNext ? theme.text : theme.disabled} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={i} style={[styles.weekDay, { color: theme.sub }]}>{w}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((date, i) => {
              if (!date) return <View key={i} style={styles.cell} />;
              const disabled = max ? date > max : false;
              const selected = sameDay(date, base);
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.cell, styles.dayCell]}
                  disabled={disabled}
                  onPress={() => onConfirm(date)}
                >
                  <View style={styles.dayBubble}>
                    {selected && <View style={styles.daySelectedCircle} />}
                    <Text style={[styles.dayText, { color: disabled ? theme.disabled : selected ? '#FFFFFF' : theme.text }]}>
                      {date.getDate()}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            <TouchableOpacity style={styles.footerBtn} onPress={onCancel}>
              <Text style={[styles.footerText, { color: theme.sub }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 340, borderRadius: 16, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: '600' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', aspectRatio: 1 },
  dayCell: { alignItems: 'center', justifyContent: 'center' },
  dayBubble: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySelectedCircle: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0A84FF',
  },
  dayText: { fontSize: 15, textAlign: 'center', textAlignVertical: 'center' },
  footer: { borderTopWidth: 1, marginTop: 8, paddingTop: 8, alignItems: 'center' },
  footerBtn: { paddingVertical: 6 },
  footerText: { fontSize: 15, fontWeight: '500' },
});
