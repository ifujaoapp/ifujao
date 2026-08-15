import { useEffect, useState } from 'react';
import { ScrollView, View, Text, Image, TouchableOpacity, Linking, Platform, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeMode } from '@/hooks/use-theme-mode';
import { showAlert } from '@/src/components/AppAlert';
import { getPetById, type PetRecord } from '@/lib/storage';

const isValidPhone = (v: string) => /^\d{10,13}$/.test(v.replace(/\D/g, ''));

export default function PetDeepLinkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme } = useThemeMode();
  const isDark = theme === 'dark';

  const [pet, setPet] = useState<PetRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const found = id ? await getPetById(id as string) : null;
      if (active) {
        setPet(found);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const openWhatsApp = (contactNumber: string) => {
    let phoneNumber = contactNumber.replace(/\D/g, '');
    if (!isValidPhone(phoneNumber)) {
      showAlert('warning', 'Atenção', 'O contato informado não é um número de WhatsApp válido.');
      return;
    }
    if (!phoneNumber.startsWith('55')) phoneNumber = `55${phoneNumber}`;
    const message = encodeURIComponent('Olá! Vi seu alerta de pet perdido no iFujão. Posso ajudar a encontrá-lo?');
    const url =
      Platform.OS === 'android'
        ? `whatsapp://send?phone=${phoneNumber}&text=${message}`
        : `https://wa.me/${phoneNumber}?text=${message}`;
    Linking.openURL(url).catch(() => showAlert('error', 'Erro', 'Não foi possível abrir o WhatsApp.'));
  };

  const bg = isDark ? '#000000' : '#F2F2F7';
  const card = isDark ? '#1C1C1E' : '#FFFFFF';
  const text = isDark ? '#FFFFFF' : '#000000';
  const sub = isDark ? '#AEAEB2' : '#3C3C43';

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={isDark ? '#FFFFFF' : '#0A84FF'} />
        </View>
      ) : !pet ? (
        <View style={styles.center}>
          <Ionicons name="paw" size={56} color={sub} style={{ marginBottom: 16 }} />
          <Text style={[styles.title, { color: text }]}>Pet não encontrado</Text>
          <Text style={[styles.message, { color: sub }]}>
            Este alerta não está salvo neste aparelho. Os alertas do iFujão ficam armazenados localmente, então o link só
            abre o pet no celular que o criou.
          </Text>
          <TouchableOpacity style={[styles.button, { backgroundColor: '#0A84FF' }]} onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.buttonText}>Voltar ao mapa</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {pet.images[0] ? (
            <Image source={{ uri: pet.images[0] }} style={styles.image} resizeMode="cover" />
          ) : null}
          <View style={[styles.card, { backgroundColor: card }]}>
            <Text style={[styles.species, { color: text }]}>{pet.species || 'Pet'}</Text>
            <Text style={[styles.row, { color: sub }]}>📍 {pet.location}</Text>
            {pet.lostDate ? <Text style={[styles.row, { color: sub }]}>🗓️ Perdido em {pet.lostDate}</Text> : null}
            {pet.description ? <Text style={[styles.desc, { color: text }]}>{pet.description}</Text> : null}
            {pet.ownerPhone ? (
              <TouchableOpacity style={[styles.button, { backgroundColor: '#34C759' }]} onPress={() => openWhatsApp(pet.ownerPhone)}>
                <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                <Text style={styles.buttonText}>Contato</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  content: { padding: 16, paddingBottom: 40 },
  image: { width: '100%', height: 280, borderRadius: 16, marginBottom: 16, backgroundColor: '#ccc' },
  card: { borderRadius: 16, padding: 18, gap: 10 },
  species: { fontSize: 22, fontWeight: '700' },
  row: { fontSize: 15 },
  desc: { fontSize: 15, lineHeight: 22, marginTop: 4 },
  message: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
