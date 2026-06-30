/**
 * ScanQR.jsx
 * Opens camera to scan a contact's QR code.
 * Parses payload, validates, saves contact, drains pending messages.
 */

import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import useContactsStore from '../../store/useContactsStore';
import useIdentityStore from '../../store/useIdentityStore';

export default function ScanQR({ onContactAdded }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned,  setScanned]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [statusMsg, setStatus]  = useState('Align the QR code within the frame');

  const { addContact }   = useContactsStore();
  const { privateKey, deviceId: myDeviceId } = useIdentityStore();

  async function handleBarCodeScanned({ data }) {
    if (scanned || loading) return;
    setScanned(true);
    setLoading(true);
    setStatus('Reading QR code…');

    try {
      // Parse QR payload
      const parsed = JSON.parse(data);
      const { username, device_id, public_key } = parsed;

      // Validate required fields
      if (!username || !device_id || !public_key) {
        throw new Error('Missing fields in QR code');
      }

      // Prevent scanning yourself
      if (device_id === myDeviceId) {
        Alert.alert("That's you!", 'You scanned your own QR code.', [
          { text: 'OK', onPress: () => { setScanned(false); setLoading(false); setStatus('Align the QR code within the frame'); } },
        ]);
        return;
      }

      setStatus('Adding contact…');

      await addContact(
        { deviceId: device_id, username, publicKey: public_key },
        privateKey,
      );

      setStatus('✓ Contact added!');
      setTimeout(() => onContactAdded?.({ username, deviceId: device_id }), 600);

    } catch (err) {
      const msg = err.message.includes('Missing fields') || err.message.includes('JSON')
        ? 'This doesn\'t look like a D-Chat QR code.'
        : 'Something went wrong. Please try again.';

      Alert.alert('Could not add contact', msg, [
        { text: 'Try again', onPress: () => { setScanned(false); setLoading(false); setStatus('Align the QR code within the frame'); } },
      ]);
    }
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

  return (
    <View style={styles.root}>
      {/* Camera */}
      <CameraView
        style={styles.camera}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      >
        {/* Overlay */}
        <View style={styles.overlay}>
          {/* Top dark band */}
          <View style={styles.band} />

          {/* Middle row: dark | scan window | dark */}
          <View style={styles.middle}>
            <View style={styles.side} />

            {/* Scan window with corner marks */}
            <View style={styles.window}>
              <View style={[styles.corner, styles.tl]} />
              <View style={[styles.corner, styles.tr]} />
              <View style={[styles.corner, styles.bl]} />
              <View style={[styles.corner, styles.br]} />
              {loading && (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator color="#A78BFA" size="large" />
                </View>
              )}
            </View>

            <View style={styles.side} />
          </View>

          {/* Bottom dark band with status */}
          <View style={[styles.band, styles.bottomBand]}>
            <Text style={styles.statusText}>{statusMsg}</Text>
            {scanned && !loading && (
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => { setScanned(false); setStatus('Align the QR code within the frame'); }}
              >
                <Text style={styles.retryText}>Scan again</Text>
              </TouchableOpacity>
            )}
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

  // Permission screen
  permTitle:     { fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginBottom: 10, textAlign: 'center' },
  permSub:       { fontSize: 14, color: '#6B6B8A', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  permBtn:       { backgroundColor: '#6C63FF', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32 },
  permBtnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Overlay
  overlay:       { flex: 1, backgroundColor: 'transparent' },
  band:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  bottomBand:    { alignItems: 'center', justifyContent: 'center', gap: 16, paddingBottom: 16 },
  middle:        { flexDirection: 'row', height: WINDOW },
  side:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },

  // Scan window
  window:        { width: WINDOW, height: WINDOW, position: 'relative' },
  loadingOverlay:{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderRadius: 4 },

  // Corner marks
  corner:        { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#A78BFA', borderWidth: BORDER },
  tl:            { top: 0, left: 0,  borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  tr:            { top: 0, right: 0, borderLeftWidth: 0,  borderBottomWidth: 0, borderTopRightRadius: 4 },
  bl:            { bottom: 0, left: 0,  borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  br:            { bottom: 0, right: 0, borderLeftWidth: 0,  borderTopWidth: 0, borderBottomRightRadius: 4 },

  // Status
  statusText:    { color: '#C4B5FD', fontSize: 14, fontWeight: '500', textAlign: 'center' },
  retryBtn:      { backgroundColor: 'rgba(108,99,255,0.3)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24, borderWidth: 1, borderColor: '#6C63FF' },
  retryText:     { color: '#A78BFA', fontWeight: '700', fontSize: 14 },
});
