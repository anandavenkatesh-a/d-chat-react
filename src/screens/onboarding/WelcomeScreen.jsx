/**
 * WelcomeScreen.jsx
 * First screen on fresh install. Sets the tone — dark, minimal, secure.
 */

import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

// Lock icon drawn with pure RN views — no image dependency
function LockIcon() {
  return (
    <View style={icon.wrapper}>
      <View style={icon.shackle} />
      <View style={icon.body}>
        <View style={icon.keyhole} />
      </View>
    </View>
  );
}

export default function WelcomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient colors={['#0D0D0D', '#1A1035']} style={styles.root}>
      {/* Top section — icon + headline */}
      <View style={[styles.top, { paddingTop: insets.top + 48 }]}>
        <LockIcon />
        <Text style={styles.wordmark}>D-Chat</Text>
        <Text style={styles.tagline}>
          Private by design.{'\n'}Encrypted by default.
        </Text>
      </View>

      {/* Middle — feature pills */}
      <View style={styles.pills}>
        {FEATURES.map((f) => (
          <View key={f.label} style={styles.pill}>
            <Text style={styles.pillIcon}>{f.icon}</Text>
            <Text style={styles.pillText}>{f.label}</Text>
          </View>
        ))}
      </View>

      {/* Bottom — CTA */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={styles.sub}>
          Your messages never touch a server.{'\n'}
          Only you and your contact can read them.
        </Text>
        <TouchableOpacity
          style={styles.btn}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Username')}
        >
          <LinearGradient
            colors={['#6C63FF', '#A78BFA']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.btnGradient}
          >
            <Text style={styles.btnText}>Get started</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const FEATURES = [
  { icon: '🔑', label: 'End-to-end encrypted' },
  { icon: '📱', label: 'Stored on your device only' },
  { icon: '🚫', label: 'No accounts, no servers' },
];

const styles = StyleSheet.create({
  root:      { flex: 1 },
  top:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  wordmark:  { fontSize: 40, fontWeight: '800', color: '#FFFFFF', letterSpacing: -1, marginTop: 24 },
  tagline:   { fontSize: 18, color: '#A78BFA', textAlign: 'center', marginTop: 12, lineHeight: 26, fontWeight: '300' },

  pills:     { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingHorizontal: 20, flexWrap: 'wrap' },
  pill:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  pillIcon:  { fontSize: 14 },
  pillText:  { fontSize: 12, color: '#C4B5FD', fontWeight: '500' },

  bottom:    { paddingHorizontal: 32, paddingTop: 40, alignItems: 'center' },
  sub:       { fontSize: 13, color: '#6B6B8A', textAlign: 'center', lineHeight: 20, marginBottom: 28 },

  btn:           { width: width - 64, borderRadius: 16, overflow: 'hidden' },
  btnGradient:   { paddingVertical: 18, alignItems: 'center' },
  btnText:       { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
});

// Lock icon styles
const icon = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  shackle: {
    width: 36, height: 22,
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    borderWidth: 5, borderColor: '#A78BFA',
    borderBottomWidth: 0,
    marginBottom: -2,
  },
  body: {
    width: 54, height: 42,
    backgroundColor: '#6C63FF',
    borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  keyhole: {
    width: 12, height: 12,
    borderRadius: 6,
    backgroundColor: '#1A1035',
  },
});
