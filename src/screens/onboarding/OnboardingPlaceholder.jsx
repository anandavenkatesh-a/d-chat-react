import { View, Text, StyleSheet } from 'react-native';

export default function OnboardingPlaceholder() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>👋 Welcome to D-Chat</Text>
      <Text style={styles.sub}>Onboarding coming in Phase 3</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  title:     { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  sub:       { color: '#888' },
});
