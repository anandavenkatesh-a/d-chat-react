/**
 * MyQRCode.jsx
 * Displays the current user's QR code for sharing with contacts.
 *
 * QR payload:
 *   { device_id, public_key }
 *
 * There is no username anywhere in this app — the person scanning this
 * code will choose their own local nickname for you after scanning.
 */

import { View, Text, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import useIdentityStore from '../../store/useIdentityStore';

export default function MyQRCode() {
  const { deviceId, getQRPayload } = useIdentityStore();
  const payload = getQRPayload();

  // Short, human-comparable fragment of the device_id — useful for
  // visually confirming two phones are showing/scanning the same code
  // side by side, without exposing anything resembling a username.
  const shortId = deviceId ? deviceId.slice(0, 8) : '';

  return (
    <View style={styles.root}>
      <Text style={styles.instruction}>
        Show this QR code to a contact so they can add you.{'\n'}
        They'll choose their own name for you — you won't see it.
      </Text>

      {/* QR card */}
      <View style={styles.card}>
        <View style={styles.qrWrapper}>
          <QRCode
            value={payload}
            size={220}
            backgroundColor="#FFFFFF"
            color="#0D0D0D"
            quietZone={16}
          />
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.idChip}>{shortId}</Text>
          <Text style={styles.hint}>D-Chat contact QR</Text>
        </View>
      </View>

      <Text style={styles.note}>
        Your private key is never included in this QR code.{'\n'}
        Only your public key and device ID are shared — no name,
        no personal information.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1, alignItems: 'center', paddingTop: 32, paddingHorizontal: 28 },
  instruction: { fontSize: 14, color: '#6B6B8A', textAlign: 'center', lineHeight: 22, marginBottom: 32 },

  card:        { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, alignItems: 'center', shadowColor: '#6C63FF', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  qrWrapper:   { borderRadius: 12, overflow: 'hidden' },
  cardFooter:  { marginTop: 16, alignItems: 'center', gap: 4 },
  idChip:      { fontSize: 14, fontWeight: '700', color: '#0D0D0D', letterSpacing: 1, fontFamily: 'monospace' },
  hint:        { fontSize: 12, color: '#999', letterSpacing: 0.5 },

  note:        { marginTop: 24, fontSize: 12, color: '#3D3D5C', textAlign: 'center', lineHeight: 18 },
});
