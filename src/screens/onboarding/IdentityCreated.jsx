/**
 * IdentityCreated.jsx
 * Shown after keypair generation. Confirms identity was created
 * and sets expectations about how the app works.
 */

import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import useIdentityStore from '../../store/useIdentityStore';

const { width } = Dimensions.get('window');

function CheckIcon() {
  return (
    <View style={check.outer}>
      <View style={check.inner}>
        <Text style={check.tick}>✓</Text>
      </View>
    </View>
  );
}

export default function IdentityCreated({ navigation }) {
  const insets = useSafeAreaInsets();
  const { username, deviceId, publicKey } = useIdentityStore();

  return (
    <LinearGradient colors={['#0D0D0D', '#1A1035']} style={styles.root}>
      <View style={[styles.inner, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 }]}>

        {/* Success icon */}
        <View style={styles.iconRow}>
          <CheckIcon />
        </View>

        {/* Headline */}
        <Text style={styles.title}>You're all set,{'\n'}@{username}</Text>
        <Text style={styles.subtitle}>
          Your identity has been created and your encryption keys are stored securely on this device.
        </Text>

        {/* Identity card */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Username</Text>
            <Text style={styles.cardValue}>@{username}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Device ID</Text>
            <Text style={styles.cardValueMono} numberOfLines={1} ellipsizeMode="middle">
              {deviceId}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Public key</Text>
            <Text style={styles.cardValueMono} numberOfLines={1} ellipsizeMode="middle">
              {publicKey}
            </Text>
          </View>
        </View>

        {/* What's next */}
        <View style={styles.steps}>
          {STEPS.map((s, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{s}</Text>
            </View>
          ))}
        </View>

        <View style={styles.flex} />

        {/* CTA — navigates to main app (triggers re-render via store) */}
        <TouchableOpacity
          style={styles.btn}
          activeOpacity={0.85}
          onPress={() => navigation.replace('Home')}
        >
          <LinearGradient
            colors={['#6C63FF', '#A78BFA']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.btnGradient}
          >
            <Text style={styles.btnText}>Start chatting</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const STEPS = [
  'Share your QR code with a friend to exchange keys',
  'Scan their QR code to add them as a contact',
  'Start sending end-to-end encrypted messages',
];

const styles = StyleSheet.create({
  root:           { flex: 1 },
  flex:           { flex: 1 },
  inner:          { flex: 1, paddingHorizontal: 28 },

  iconRow:        { alignItems: 'center', marginBottom: 28 },

  title:          { fontSize: 32, fontWeight: '800', color: '#FFFFFF', lineHeight: 40, letterSpacing: -0.5, marginBottom: 12 },
  subtitle:       { fontSize: 14, color: '#6B6B8A', lineHeight: 22, marginBottom: 28 },

  card:           { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 16, marginBottom: 28 },
  cardRow:        { paddingVertical: 10, gap: 4 },
  cardLabel:      { fontSize: 11, color: '#4A4A6A', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  cardValue:      { fontSize: 15, color: '#A78BFA', fontWeight: '700' },
  cardValueMono:  { fontSize: 12, color: '#7C7C9C', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  divider:        { height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },

  steps:          { gap: 14 },
  step:           { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepNum:        { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(108,99,255,0.3)', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText:    { fontSize: 11, color: '#A78BFA', fontWeight: '700' },
  stepText:       { flex: 1, fontSize: 13, color: '#8888AA', lineHeight: 20 },

  btn:            { borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  btnGradient:    { paddingVertical: 18, alignItems: 'center' },
  btnText:        { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
});

const check = StyleSheet.create({
  outer: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(52,211,153,0.15)', alignItems: 'center', justifyContent: 'center' },
  inner: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(52,211,153,0.25)', alignItems: 'center', justifyContent: 'center' },
  tick:  { fontSize: 26, color: '#34D399' },
});
