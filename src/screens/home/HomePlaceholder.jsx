import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useIdentityStore from '../../store/useIdentityStore';

export default function HomePlaceholder() {
  const { username, deviceId } = useIdentityStore();
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient colors={['#0D0D0D', '#1A1035']} style={styles.root}>
      <View style={[styles.inner, { paddingTop: insets.top + 32 }]}>
        <Text style={styles.title}>D-Chat</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Signed in as</Text>
          <Text style={styles.username}>@{username}</Text>
          <Text style={styles.deviceId} numberOfLines={1} ellipsizeMode="middle">
            {deviceId}
          </Text>
        </View>
        <Text style={styles.hint}>Chat UI coming in Phase 6 ✦</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1 },
  inner:    { flex: 1, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 36, fontWeight: '800', color: '#fff', letterSpacing: -1, marginBottom: 32 },
  card:     { width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 20, alignItems: 'center', gap: 6 },
  label:    { fontSize: 12, color: '#4A4A6A', textTransform: 'uppercase', letterSpacing: 1 },
  username: { fontSize: 22, fontWeight: '700', color: '#A78BFA' },
  deviceId: { fontSize: 11, color: '#3D3D5C', fontFamily: 'monospace', marginTop: 4 },
  hint:     { marginTop: 32, color: '#3D3D5C', fontSize: 13 },
});
