/**
 * ScanQR.jsx
 * Opens camera to scan a contact's QR code.
 *
 * Flow:
 *   1. Scan & parse QR → { device_id, public_key } (no username in the
 *      payload at all — this app has no username concept anywhere)
 *   2. Ask the user to choose a LOCAL nickname for this contact
 *   3. Check for collisions before saving:
 *      - device_id already exists as a contact → warn, offer to update
 *        their key/nickname instead of silently overwriting
 *      - nickname already used by a DIFFERENT contact → warn (heads-up
 *        only, not blocking — nicknames aren't unique, just local labels)
 *   4. Save contact, drain any pending messages, done
 */

import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import useContactsStore from '../../store/useContactsStore';
import useIdentityStore from '../../store/useIdentityStore';

const STEP_SCANNING = 'scanning';
const STEP_NAMING   = 'naming';

export default function ScanQR({ onContactAdded }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep]         = useState(STEP_SCANNING);
  const [scannedData, setScannedData] = useState(null); // { deviceId, publicKey }
  const [nickname, setNickname] = useState('');
  const [saving, setSaving]     = useState(false);
  const [statusMsg, setStatus]  = useState('Align the QR code within the frame');

  const { addContact, checkForCollisions } = useContactsStore();
  const { deviceId: myDeviceId }            = useIdentityStore();

  function handleBarCodeScanned({ data }) {
    if (step !== STEP_SCANNING) return;

    try {
      const parsed = JSON.parse(data);
      const { device_id, public_key } = parsed;

      if (!device_id || !public_key) {
        throw new Error('Missing fields in QR code');
      }

      if (device_id === myDeviceId) {
        Alert.alert("That's you!", 'You scanned your own QR code.');
        return;
      }

      setScannedData({ deviceId: device_id, publicKey: public_key });
      setStep(STEP_NAMING);

    } catch (err) {
      Alert.alert(
        'Could not read QR code',
        "This doesn't look like a D-Chat QR code. Please try again.",
      );
    }
  }

  async function handleConfirmNickname() {
    const trimmed = nickname.trim();
    if (!trimmed || saving) return;

    setSaving(true);

    try {
      const { deviceIdCollision, nicknameCollision } =
        await checkForCollisions(scannedData.deviceId, trimmed);

      // An erased contact (publicKey nulled out) being re-scanned is the
      // intended RESTORE flow, not a duplicate — this is allowed through
      // without any warning. Everything else below is a hard block.
      const isRestoringErasedContact =
        deviceIdCollision && !deviceIdCollision.publicKey;

      if (deviceIdCollision && !isRestoringErasedContact) {
        setSaving(false);
        Alert.alert(
          'Already in your contacts',
          `This contact is already saved as "${deviceIdCollision.nickname}". ` +
          `To change their name or key, erase them from their chat first, then scan again.`,
          [{ text: 'OK', onPress: handleRetry }],
        );
        return;
      }

      if (nicknameCollision) {
        setSaving(false);
        Alert.alert(
          'Name already in use',
          `You already have a different contact named "${nicknameCollision.nickname}". ` +
          `Please choose a different name for this contact.`,
          [{ text: 'OK' }],
        );
        return;
      }

      await proceedWithSave();

    } catch (err) {
      setSaving(false);
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }

  async function proceedWithSave() {
    setSaving(true);
    setStatus('Adding contact…');
    try {
      const { privateKey } = useIdentityStore.getState();
      await addContact(
        {
          deviceId:  scannedData.deviceId,
          nickname:  nickname.trim(),
          publicKey: scannedData.publicKey,
        },
        privateKey,
      );
      onContactAdded?.({ nickname: nickname.trim(), deviceId: scannedData.deviceId });
    } catch (err) {
      setSaving(false);
      Alert.alert('Could not add contact', 'Please try again.');
    }
  }

  function handleRetry() {
    setStep(STEP_SCANNING);
    setScannedData(null);
    setNickname('');
    setStatus('Align the QR code within the frame');
  }

  // ── Permission not yet determined ─────────────────────────────────────────
  if (!permission) {
    return <View style={styles.center}><ActivityIndicator color="#6C63FF" /></View>;
  }

  // ── Permission denied ─────────────────────────────────────────────────────
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permSub}>D-Chat needs your camera to scan contact QR codes.</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Allow camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Naming step — choose a local nickname for the scanned contact ─────────
  if (step === STEP_NAMING) {
    return (
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.namingWrap}>
          <Text style={styles.namingIcon}>✓</Text>
          <Text style={styles.namingTitle}>QR code scanned</Text>
          <Text style={styles.namingSub}>
            Give this contact a name — only you will see it.{'\n'}
            They have no username of their own to show you.
          </Text>

          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              value={nickname}
              onChangeText={setNickname}
              placeholder="e.g. Alex, Mom, Work friend…"
              placeholderTextColor="#3D3D5C"
              autoFocus
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={handleConfirmNickname}
              editable={!saving}
            />
          </View>

          <TouchableOpacity
            style={[styles.confirmBtn, (!nickname.trim() || saving) && styles.confirmBtnDisabled]}
            onPress={handleConfirmNickname}
            disabled={!nickname.trim() || saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.confirmBtnText}>Save contact</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={handleRetry} disabled={saving}>
            <Text style={styles.cancelText}>Scan a different code</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Scanning step ─────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <CameraView
        style={styles.camera}
        facing="back"
        onBarcodeScanned={handleBarCodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      >
        <View style={styles.overlay}>
          <View style={styles.band} />

          <View style={styles.middle}>
            <View style={styles.side} />
            <View style={styles.window}>
              <View style={[styles.corner, styles.tl]} />
              <View style={[styles.corner, styles.tr]} />
              <View style={[styles.corner, styles.bl]} />
              <View style={[styles.corner, styles.br]} />
            </View>
            <View style={styles.side} />
          </View>

          <View style={[styles.band, styles.bottomBand]}>
            <Text style={styles.statusText}>{statusMsg}</Text>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const WINDOW = 240;
const CORNER = 24;
const BORDER = 4;

const styles = StyleSheet.create({
  root:          { flex: 1 },
  camera:        { flex: 1 },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  permTitle:     { fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginBottom: 10, textAlign: 'center' },
  permSub:       { fontSize: 14, color: '#6B6B8A', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  permBtn:       { backgroundColor: '#6C63FF', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32 },
  permBtnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },

  overlay:       { flex: 1, backgroundColor: 'transparent' },
  band:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  bottomBand:    { alignItems: 'center', justifyContent: 'center', gap: 16, paddingBottom: 16 },
  middle:        { flexDirection: 'row', height: WINDOW },
  side:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },

  window:        { width: WINDOW, height: WINDOW, position: 'relative' },

  corner:        { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#A78BFA', borderWidth: BORDER },
  tl:            { top: 0, left: 0,  borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  tr:            { top: 0, right: 0, borderLeftWidth: 0,  borderBottomWidth: 0, borderTopRightRadius: 4 },
  bl:            { bottom: 0, left: 0,  borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  br:            { bottom: 0, right: 0, borderLeftWidth: 0,  borderTopWidth: 0, borderBottomRightRadius: 4 },

  statusText:    { color: '#C4B5FD', fontSize: 14, fontWeight: '500', textAlign: 'center' },

  // Naming step
  namingWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, backgroundColor: '#0D0D0D' },
  namingIcon:    { fontSize: 40, color: '#34D399', marginBottom: 16 },
  namingTitle:   { fontSize: 22, fontWeight: '700', color: '#FFFFFF', marginBottom: 10 },
  namingSub:     { fontSize: 14, color: '#6B6B8A', textAlign: 'center', lineHeight: 22, marginBottom: 28 },

  inputWrapper:  { width: '100%', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(108,99,255,0.4)', paddingHorizontal: 16, marginBottom: 20 },
  input:         { fontSize: 17, color: '#FFFFFF', paddingVertical: 16, fontWeight: '600' },

  confirmBtn:    { width: '100%', backgroundColor: '#6C63FF', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 16 },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText:{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  cancelText:    { color: '#6B6B8A', fontSize: 13, textDecorationLine: 'underline' },
});
