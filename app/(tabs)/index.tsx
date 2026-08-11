import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, Image, SafeAreaView, View, Text, Modal, Linking, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import MapView, { Marker, Region, UrlTile } from 'react-native-maps';
import * as Location from 'expo-location';
import { Colors } from '@/constants/theme'; 

interface PetPost {
  id: string;
  species: string;
  location: string;
  description: string;
  contact: string;
  images: string[];
  latitude: number;
  longitude: number;
}

const MAX_IMAGES = 3;

const SOROCABA_REGION = {
  latitude: -23.5019,
  longitude: -47.4581,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

export default function HomeScreen() {
  const [pets, setPets] = useState<PetPost[]>([]);
  const [isReportModalVisible, setReportModalVisible] = useState(false);
  const [isAboutVisible, setIsAboutVisible] = useState(false);
  const [species, setSpecies] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [contact, setContact] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [cameraReady, setCameraReady] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [flash, setFlash] = useState<'off' | 'on' | 'auto'>('off');
  const cameraRef = useRef<CameraView>(null);
  const [, requestCameraPermission] = useCameraPermissions();
  const [mapRegion, setMapRegion] = useState<Region>(SOROCABA_REGION);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão negada', 'Precisamos de permissão para acessar sua localização para mostrar o mapa corretamente.');
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      setMapRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      });
    })();
  }, []);

  const abrirCamera = async () => {
    const { granted } = await requestCameraPermission();
    if (!granted) {
      Alert.alert('Permissão Negada', 'Precisamos de permissão para acessar a câmera.');
      return;
    }
    setCameraReady(false);
    setZoom(0);
    setIsCameraOpen(true);
  };

  const zoomStep = 0.2;
  const zoomIn = () => setZoom(prev => Math.min(prev + zoomStep, 1));
  const zoomOut = () => setZoom(prev => Math.max(prev - zoomStep, 0));

  const flashModes: ('off' | 'on' | 'auto')[] = ['off', 'on', 'auto'];
  const toggleFlash = () => setFlash(prev => flashModes[(flashModes.indexOf(prev) + 1) % flashModes.length]);

  const tirarFoto = async () => {
    if (!cameraRef.current || !cameraReady) return;
    if (images.length >= MAX_IMAGES) {
      Alert.alert('Limite atingido', `Você pode adicionar no máximo ${MAX_IMAGES} fotos.`);
      return;
    }
    const foto = await cameraRef.current.takePictureAsync({ quality: 0.8 });
    setImages(prev => [...prev, foto.uri]);
  };

  const removerFoto = (uri: string) => {
    setImages(prev => prev.filter(item => item !== uri));
  };

  const fecharModal = () => {
    setIsCameraOpen(false);
    setReportModalVisible(false);
  };

  const handleAddPet = async () => {
    if (images.length === 0 || !species || !location || !contact) {
      Alert.alert('Atenção', 'Preencha todos os campos e adicione ao menos uma foto.');
      return;
    }
    let latitude = mapRegion.latitude;
    let longitude = mapRegion.longitude;
    try {
      const last = await Location.getLastKnownPositionAsync({});
      if (last) {
        latitude = last.coords.latitude;
        longitude = last.coords.longitude;
      }
    } catch {}
    const newPet: PetPost = {
      id: Date.now().toString(),
      species, location, description, contact, images,
      latitude,
      longitude,
    };
    setPets([newPet, ...pets]);
    setSpecies(''); setLocation(''); setDescription(''); setContact(''); setImages([]);
    setIsCameraOpen(false);
    setReportModalVisible(false);
    Alert.alert('Sucesso!', 'Alerta publicado!');
  };

  const openWhatsApp = (contactNumber: string) => {
    const phoneNumber = contactNumber.replace(/\D/g, '');
    const url = Platform.OS === 'android' ? `whatsapp://send?phone=55${phoneNumber}` : `https://wa.me/55${phoneNumber}`;
    Linking.openURL(url).catch(() => Alert.alert('Erro', 'Não foi possível abrir o WhatsApp.'));
  };

  return (
    <View style={styles.container}>
      <MapView 
        style={styles.map} 
        region={mapRegion}
        showsUserLocation={true}
      >
        <UrlTile
          urlTemplate="https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
          maximumZ={19}
        />
        {pets.map(pet => (
          <Marker
            key={pet.id}
            coordinate={{ latitude: pet.latitude, longitude: pet.longitude }}
            title={pet.species}
            description={pet.location}
            image={pet.images.length > 0 ? { uri: pet.images[0] } : undefined}
            onCalloutPress={() => openWhatsApp(pet.contact)}
          />
      ))}
      </MapView>

      <SafeAreaView style={styles.aboutButtonContainer}>
        <TouchableOpacity style={styles.aboutButton} onPress={() => setIsAboutVisible(true)}>
          <Ionicons name="information-circle" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </SafeAreaView>

      <SafeAreaView style={styles.floatingButtonContainer}>
        <TouchableOpacity style={styles.floatingButton} onPress={() => setReportModalVisible(true)}>
          <Text style={styles.floatingButtonText}>Reportar Pet Perdido</Text>
        </TouchableOpacity>
      </SafeAreaView>

      <Modal
        animationType="slide"
        transparent={false}
        visible={isReportModalVisible}
        onRequestClose={fecharModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          <ScrollView contentContainerStyle={styles.modalScrollView}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reportar Pet Perdido</Text>
              <TouchableOpacity style={styles.roundClose} onPress={fecharModal}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {isCameraOpen ? (
              <View style={styles.cameraBox}>
                <CameraView
                  ref={cameraRef}
                  style={styles.camera}
                  facing={facing}
                  zoom={zoom}
                  flash={flash}
                  onCameraReady={() => setCameraReady(true)}
                >
                  {!cameraReady && (
                    <View style={styles.cameraLoading}>
                      <ActivityIndicator size="large" color="#FFFFFF" />
                    </View>
                  )}
                </CameraView>
                <View style={styles.cameraHeader}>
                  <View style={styles.cameraPill}>
                    <Text style={styles.cameraCounter}>{images.length}/{MAX_IMAGES}</Text>
                  </View>
                  <View style={styles.cameraHeaderRight}>
                    <TouchableOpacity style={styles.cameraActionBtn} onPress={toggleFlash}>
                      <Ionicons
                        name={flash === 'off' ? 'flash-off' : flash === 'on' ? 'flash' : 'flash-outline'}
                        size={22}
                        color="#FFFFFF"
                      />
                    </TouchableOpacity>
                    <View style={styles.cameraCloseWrap}>
                      <TouchableOpacity style={styles.cameraClose} onPress={() => setIsCameraOpen(false)}>
                        <Ionicons name="close" size={22} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
                <View style={styles.cameraControls}>
                  <View style={styles.cameraFlip}>
                    <TouchableOpacity onPress={() => setFacing(f => (f === 'back' ? 'front' : 'back'))}>
                      <Ionicons name="camera-reverse" size={28} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.captureButton} onPress={tirarFoto} disabled={!cameraReady} />
                  <View style={styles.cameraZoomGroup}>
                    <TouchableOpacity style={styles.cameraZoomBtn} onPress={zoomOut} disabled={zoom <= 0}>
                      <Ionicons name="remove" size={24} color={zoom <= 0 ? 'rgba(255,255,255,0.4)' : '#FFFFFF'} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cameraZoomBtn} onPress={zoomIn} disabled={zoom >= 1}>
                      <Ionicons name="add" size={24} color={zoom >= 1 ? 'rgba(255,255,255,0.4)' : '#FFFFFF'} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.photoBlock}>
                <View style={styles.photoRow}>
                  {images.map((uri, idx) => (
                    <View key={uri} style={styles.photoThumb}>
                      <Image source={{ uri }} style={styles.photoThumbImage} />
                      <TouchableOpacity style={styles.photoRemove} onPress={() => removerFoto(uri)}>
                        <Ionicons name="close" size={16} color="#FFFFFF" />
                      </TouchableOpacity>
                      {idx === 0 && <View style={styles.photoPrimaryBadge}><Text style={styles.photoPrimaryText}>Principal</Text></View>}
                    </View>
                  ))}
                  {images.length < MAX_IMAGES && (
                    <TouchableOpacity style={styles.photoAdd} onPress={abrirCamera}>
                      <Ionicons name="camera" size={40} color={Colors.light.primaryButton} />
                      <Text style={styles.bigCameraButtonText}>Adicionar</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.photoHint}>Até {MAX_IMAGES} fotos. A primeira será a foto principal do alerta.</Text>
              </View>
            )}

            <TextInput style={styles.input} placeholder="Espécie / Raça" placeholderTextColor="#8E8E93" value={species} onChangeText={setSpecies} />
            <TextInput style={styles.input} placeholder="Última Localização Vista" placeholderTextColor="#8E8E93" value={location} onChangeText={setLocation} />
            <TextInput style={[styles.input, styles.textArea]} placeholder="Descrição Adicional" placeholderTextColor="#8E8E93" value={description} onChangeText={setDescription} multiline />
            <TextInput style={styles.input} placeholder="Contato (WhatsApp)" placeholderTextColor="#8E8E93" value={contact} onChangeText={setContact} keyboardType="phone-pad" />

            <TouchableOpacity style={styles.submitButton} onPress={handleAddPet}>
              <Text style={styles.submitButtonText}>Publicar Alerta</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal
        animationType="fade"
        transparent={true}
        visible={isAboutVisible}
        onRequestClose={() => setIsAboutVisible(false)}
      >
        <TouchableOpacity style={styles.aboutOverlay} activeOpacity={1} onPress={() => setIsAboutVisible(false)}>
          <View style={styles.aboutCard}>
            <Text style={styles.aboutTitle}>iFujão</Text>
            <Text style={styles.aboutText}>
              App para ajudar a encontrar pets perdidos. Registre um pet, informe a localização e o contato para quem encontrá-lo entrar em contato pelo WhatsApp.
            </Text>
            <Text style={styles.aboutVersion}>Versão 1.0.0</Text>
            <TouchableOpacity style={styles.aboutClose} onPress={() => setIsAboutVisible(false)}>
              <Text style={styles.aboutCloseText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  floatingButtonContainer: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
  },
  floatingButton: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 15,
    paddingHorizontal: 25,
    borderRadius: 30,
  },
  floatingButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  modalScrollView: { padding: 20 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.light.text,
  },
  roundClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bigCameraButtonText: {
    color: Colors.light.primaryButton,
    fontWeight: 'bold',
    fontSize: 16,
  },
  photoBlock: {
    marginBottom: 20,
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoThumb: {
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.light.secondaryButton,
  },
  photoThumbImage: {
    width: '100%',
    height: '100%',
  },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPrimaryBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: Colors.light.primaryButton,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  photoPrimaryText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  photoAdd: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: Colors.light.primaryButton,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.light.secondaryButton,
  },
  photoHint: {
    marginTop: 10,
    fontSize: 13,
    color: '#8E8E93',
  },
  cameraBox: {
    position: 'relative',
    height: 440,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  cameraLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    zIndex: 2,
  },
  cameraPill: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  cameraHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cameraActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraCounter: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  cameraControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingBottom: 24,
    zIndex: 2,
  },
  cameraCloseWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  cameraClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraFlip: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFFFFF',
    borderWidth: 5,
    borderColor: 'rgba(0,0,0,0.3)',
  },
  cameraZoomGroup: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  cameraZoomBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.light.cardStroke,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 15,
    fontSize: 16,
    color: Colors.light.text,
    marginBottom: 15,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: Colors.light.primaryButton,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  aboutButtonContainer: {
    position: 'absolute',
    top: 50,
    right: 16,
  },
  aboutButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  aboutOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  aboutCard: {
    width: '100%',
    backgroundColor: Colors.light.card,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
  },
  aboutTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: Colors.light.text,
    marginBottom: 12,
  },
  aboutText: {
    fontSize: 15,
    color: Colors.light.text,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  aboutVersion: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 20,
  },
  aboutClose: {
    backgroundColor: Colors.light.primaryButton,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  aboutCloseText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
