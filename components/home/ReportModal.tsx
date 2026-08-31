import { useRef } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView } from "expo-camera";
import DropDownPicker from "react-native-dropdown-picker";
import { SafeAreaView, type EdgeInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/theme";
import {
  SPECIES_BREEDS,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  formatBytes,
} from "@/constants/breeds";
import { useReportForm } from "@/hooks/useReportForm";
import { usePetCamera } from "@/hooks/usePetCamera";
import { useMapLocation } from "@/hooks/useMapLocation";
import type { HomeStyles } from "@/app/(tabs)/index";
import { MapPicker } from "./MapPicker";
import { CloseCircle } from "@/components/CloseCircle";

export function ReportModal({
  form,
  camera,
  map,
  themeColors,
  theme,
  insets,
  styles,
  onClose,
}: {
  form: ReturnType<typeof useReportForm>;
  camera: ReturnType<typeof usePetCamera>;
  map: ReturnType<typeof useMapLocation>;
  themeColors: typeof Colors.light;
  theme: "light" | "dark";
  insets: EdgeInsets;
  styles: HomeStyles;
  onClose: () => void;
  onNeedAcceptTerms: () => void;
}) {
  const {
    species,
    setSpecies,
    breed,
    setBreed,
    name,
    setName,
    location,
    setLocation,
    cityName,
    searchAddress,
    setSearchAddress,
    description,
    setDescription,
    reward,
    setReward,
    contact,
    setContact,
    contactError,
    setContactError,
    lostDate,
    setShowDatePicker,
    postType,
    setPostType,
    postTypeLocked,
    foundDate,
    speciesPickerOpen,
    setSpeciesPickerOpen,
    breedPickerOpen,
    setBreedPickerOpen,
    speciesItems,
    breedItems,
    formatPhone,
    isValidPhone,
    handleAddPet,
    procurarEndereco,
    handlePickLocation,
    usarMeuGps,
  } = form;
  const activeDate = postType === 'found' ? foundDate : lostDate;
  const {
    isCameraOpen,
    setIsCameraOpen,
    images,
    cameraRef,
    facing,
    setFacing,
    cameraReady,
    setCameraReady,
    zoom,
    flash,
    toggleFlash,
    zoomIn,
    zoomOut,
    tirarFoto,
    removerFoto,
    escolherFonte,
  } = camera;
  const {
    petLocation,
    mapRegion,
    userLocation,
    gpsNonce,
    selectedCity,
  } = map;

  const locationRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);
  const contactRef = useRef<TextInput>(null);

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={true}
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[styles.modalContainer, { paddingTop: StatusBar.currentHeight ?? 0 }]}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {postType === 'found' ? 'Reportar Pet Encontrado' : 'Reportar Pet Perdido'}
            </Text>
            <CloseCircle onPress={onClose} />
          </View>
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: '#E5E5EA',
              borderRadius: 10,
              padding: 3,
              marginHorizontal: 16,
              marginBottom: 12,
            }}
          >
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 9,
                  borderRadius: 8,
                  opacity: postTypeLocked && postType === 'found' ? 0.4 : 1,
                  backgroundColor: postType === 'lost' ? '#FFFFFF' : 'transparent',
                }}
                disabled={postTypeLocked && postType === 'found'}
                onPress={() => setPostType('lost')}
              >
                <Text
                  style={{
                    textAlign: 'center',
                    fontSize: 14,
                    fontWeight: '600',
                    color: postType === 'lost' ? themeColors.primaryButton : '#3C3C43',
                  }}
                >
                  Perdi um pet
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 9,
                  borderRadius: 8,
                  opacity: postTypeLocked && postType === 'lost' ? 0.4 : 1,
                  backgroundColor: postType === 'found' ? '#FFFFFF' : 'transparent',
                }}
                disabled={postTypeLocked && postType === 'lost'}
                onPress={() => setPostType('found')}
              >
                <Text
                  style={{
                    textAlign: 'center',
                    fontSize: 14,
                    fontWeight: '600',
                    color: postType === 'found' ? themeColors.primaryButton : '#3C3C43',
                  }}
                >
                  Encontrei um pet
                </Text>
              </TouchableOpacity>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.modalScrollView}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled={true}
          >
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons
                  name="images"
                  size={16}
                  color={themeColors.primaryButton}
                />
                <Text style={styles.sectionTitle}>Fotos</Text>
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
                      <Text style={styles.cameraCounter}>
                        {images.length}/{MAX_IMAGES}
                      </Text>
                    </View>
                    <View style={styles.cameraHeaderRight}>
                      <TouchableOpacity
                        style={styles.cameraActionBtn}
                        onPress={toggleFlash}
                      >
                        <Ionicons
                          name={
                            flash === "off"
                              ? "flash-off"
                              : flash === "on"
                                ? "flash"
                                : "flash-outline"
                          }
                          size={22}
                          color="#FFFFFF"
                        />
                      </TouchableOpacity>
                      <CloseCircle onPress={() => setIsCameraOpen(false)} />
                    </View>
                  </View>
                  <View style={styles.cameraControls}>
                    <View style={styles.cameraFlip}>
                      <TouchableOpacity
                        onPress={() =>
                          setFacing((f) => (f === "back" ? "front" : "back"))
                        }
                      >
                        <Ionicons
                          name="camera-reverse"
                          size={28}
                          color="#FFFFFF"
                        />
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      style={styles.captureButton}
                      onPress={tirarFoto}
                      disabled={!cameraReady}
                    />
                    <View style={styles.cameraZoomGroup}>
                      <TouchableOpacity
                        style={styles.cameraZoomBtn}
                        onPress={zoomOut}
                        disabled={zoom <= 0}
                      >
                        <Ionicons
                          name="remove"
                          size={24}
                          color={
                            zoom <= 0 ? "rgba(255,255,255,0.4)" : "#FFFFFF"
                          }
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.cameraZoomBtn}
                        onPress={zoomIn}
                        disabled={zoom >= 1}
                      >
                        <Ionicons
                          name="add"
                          size={24}
                          color={
                            zoom >= 1 ? "rgba(255,255,255,0.4)" : "#FFFFFF"
                          }
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.photoBlock}>
                  <View style={styles.photoRow}>
                    {images.map((uri, idx) => (
                      <View key={uri} style={styles.photoThumb}>
                        <Image
                          source={{ uri }}
                          style={styles.photoThumbImage}
                        />
                        <CloseCircle
                          style={{ position: "absolute", top: 4, right: 4 }}
                          onPress={() => removerFoto(uri)}
                        />
                        {idx === 0 && (
                          <View style={styles.photoPrimaryBadge}>
                            <Text style={styles.photoPrimaryText}>
                              Principal
                            </Text>
                          </View>
                        )}
                      </View>
                    ))}
                    {images.length < MAX_IMAGES && (
                      <TouchableOpacity
                        style={styles.photoAdd}
                        onPress={escolherFonte}
                      >
                        <Ionicons
                          name="camera"
                          size={40}
                          color={themeColors.primaryButton}
                        />
                        <Text style={styles.bigCameraButtonText}>
                          Adicionar
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.photoHint}>
                    Até {MAX_IMAGES} fotos (máx.{" "}
                    {formatBytes(MAX_IMAGE_BYTES)} cada). A primeira será a foto
                    principal do alerta.
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons
                  name="location"
                  size={16}
                  color={themeColors.primaryButton}
                />
                <Text style={styles.sectionTitle}>Localização</Text>
              </View>
                <Text style={styles.fieldLabel}>
                  {postType === 'found' ? 'Quando você encontrou? *' : 'Quando o pet sumiu? *'}
                </Text>
              <TouchableOpacity
                style={styles.dateField}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="calendar"
                  size={18}
                  color={themeColors.primaryButton}
                />
                <Text
                  style={[
                    styles.dateFieldText,
                    !activeDate && { color: themeColors.icon },
                  ]}
                >
                  {activeDate
                    ? activeDate.toLocaleDateString("pt-BR")
                    : "Toque para selecionar a data"}
                </Text>
              </TouchableOpacity>

              <Text style={styles.pickLabel}>Onde o pet foi visto?</Text>
              <View style={styles.searchAddressRow}>
                <TextInput
                  style={styles.searchAddressInput}
                  placeholder="Rua, número, cidade"
                  placeholderTextColor="#8E8E93"
                  value={searchAddress}
                  onChangeText={setSearchAddress}
                  returnKeyType="search"
                  onSubmitEditing={procurarEndereco}
                />
                <TouchableOpacity
                  style={styles.searchAddressBtn}
                  onPress={procurarEndereco}
                >
                  <Ionicons name="search" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              <View
                style={styles.pickMapWrap}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderTerminationRequest={() => false}
              >
                <MapPicker
                  initial={
                    petLocation ?? {
                      latitude: mapRegion.latitude,
                      longitude: mapRegion.longitude,
                    }
                  }
                  value={petLocation}
                  userLocation={userLocation}
                  gpsNonce={gpsNonce}
                  theme={theme}
                  city={selectedCity}
                  onPick={handlePickLocation}
                />
              </View>
              <TouchableOpacity style={styles.useGpsBtn} onPress={usarMeuGps}>
                <Ionicons name="locate" size={18} color="#0A84FF" />
                <Text style={styles.useGpsText}>
                  Usar meu GPS (onde estou)
                </Text>
              </TouchableOpacity>
              {cityName ? (
                <View style={styles.cityHintRow}>
                  <Ionicons
                    name="location"
                    size={14}
                    color={themeColors.icon}
                  />
                  <Text style={styles.cityHintText}>Cidade: {cityName}</Text>
                </View>
              ) : null}

              <Text style={styles.fieldLabel}>
                Última Localização Vista *
              </Text>
              <TextInput
                ref={locationRef}
                style={styles.input}
                placeholder="Ex.: Rua das Flores, perto da praça"
                placeholderTextColor="#8E8E93"
                value={location}
                onChangeText={setLocation}
                returnKeyType="next"
                onSubmitEditing={() => descriptionRef.current?.focus()}
              />
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons
                  name="paw"
                  size={16}
                  color={themeColors.primaryButton}
                />
                <Text style={styles.sectionTitle}>Sobre o pet</Text>
              </View>
              <Text style={styles.fieldLabel}>Nome do pet (opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex.: Thor, Mel, Bob"
                placeholderTextColor="#8E8E93"
                value={name}
                onChangeText={setName}
                returnKeyType="next"
                maxLength={40}
                onSubmitEditing={() => descriptionRef.current?.focus()}
              />
              <Text style={styles.fieldLabel}>Espécie *</Text>
              <DropDownPicker
                open={speciesPickerOpen}
                value={species || null}
                items={speciesItems}
                setOpen={setSpeciesPickerOpen}
                setValue={(v) =>
                  setSpecies(
                    typeof v === "function"
                      ? (v as (p: string) => string)(species)
                      : ((v as string) ?? ""),
                  )
                }
                onChangeValue={(v) => {
                  const t = v ?? "";
                  const valid = SPECIES_BREEDS[t];
                  if (valid && breed && !valid.includes(breed)) {
                    setBreed("");
                  }
                }}
                listMode="MODAL"
                maxHeight={400}
                placeholder="Selecione a espécie"
                searchPlaceholder="Digite para buscar"
                searchable
                modalTitle="Selecione a Espécie"
                modalTitleStyle={styles.rdpModalTitle}
                modalContentContainerStyle={[
                  styles.rdpModalContent,
                  { marginTop: insets.top + 8 },
                ]}
                modalProps={{
                  transparent: true,
                  presentationStyle: "overFullScreen",
                }}
                style={styles.rdpPicker}
                dropDownContainerStyle={styles.rdpDropdown}
                textStyle={styles.rdpText}
                placeholderStyle={styles.rdpPlaceholder}
                searchTextInputStyle={styles.rdpText}
              />
              <Text style={styles.fieldLabel}>Raça *</Text>
              <DropDownPicker
                open={breedPickerOpen}
                value={breed || null}
                items={breedItems}
                setOpen={setBreedPickerOpen}
                setValue={(v) =>
                  setBreed(
                    typeof v === "function"
                      ? (v as (p: string) => string)(breed)
                      : ((v as string) ?? ""),
                  )
                }
                listMode="MODAL"
                maxHeight={400}
                placeholder="Selecione a raça"
                searchPlaceholder="Digite para buscar"
                searchable
                disabled={breedItems.length === 0}
                modalTitle="Selecione a Raça"
                modalTitleStyle={styles.rdpModalTitle}
                modalContentContainerStyle={[
                  styles.rdpModalContent,
                  { marginTop: insets.top + 8 },
                ]}
                modalProps={{
                  transparent: true,
                  presentationStyle: "overFullScreen",
                }}
                style={styles.rdpPicker}
                dropDownContainerStyle={styles.rdpDropdown}
                textStyle={styles.rdpText}
                placeholderStyle={styles.rdpPlaceholder}
                searchTextInputStyle={styles.rdpText}
              />
              <Text style={styles.fieldLabel}>
                Descrição Adicional (opcional)
              </Text>
              <TextInput
                ref={descriptionRef}
                style={[styles.input, styles.textArea]}
                placeholder="Detalhes que ajudem a identificar o pet"
                placeholderTextColor="#8E8E93"
                value={description}
                onChangeText={setDescription}
                multiline
                returnKeyType="next"
                onSubmitEditing={() => contactRef.current?.focus()}
              />
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons
                  name="call"
                  size={16}
                  color={themeColors.primaryButton}
                />
                <Text style={styles.sectionTitle}>
                  {postType === 'found' ? 'Contato' : 'Contato e Recompensa'}
                </Text>
              </View>
              {postType === 'lost' && (
                <>
                  <Text style={styles.fieldLabel}>Recompensa (opcional)</Text>
                  <View style={styles.rewardField}>
                    <Text style={styles.rewardPrefix}>R$</Text>
                    <TextInput
                      style={styles.rewardInput}
                      placeholder="0,00"
                      placeholderTextColor="#8E8E93"
                      value={reward ? Number(reward).toLocaleString("pt-BR") : ""}
                      onChangeText={(t) => setReward(t.replace(/\D/g, ""))}
                      keyboardType="number-pad"
                      returnKeyType="next"
                      onSubmitEditing={() => contactRef.current?.focus()}
                    />
                  </View>
                </>
              )}
              <Text style={styles.fieldLabel}>Cel (WhatsApp) *</Text>
              <TextInput
                ref={contactRef}
                style={[styles.input, contactError ? styles.inputError : null]}
                placeholder="(15) 99999.9999"
                placeholderTextColor="#8E8E93"
                value={contact}
                onChangeText={(t) => {
                  const f = formatPhone(t);
                  setContact(f);
                  setContactError(
                    f && !isValidPhone(f)
                      ? "Número de WhatsApp inválido (use DDD + 9 dígitos)."
                      : "",
                  );
                }}
                keyboardType="phone-pad"
                returnKeyType="done"
                maxLength={16}
              />
              {contactError ? (
                <Text style={styles.fieldError}>{contactError}</Text>
              ) : null}
            </View>

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleAddPet}
            >
              <Text style={styles.submitButtonText}>
                {postType === 'found' ? 'Publicar Achado' : 'Publicar Alerta'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
