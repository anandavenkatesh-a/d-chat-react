/**
 * ErasedBanner.jsx
 * Shown inside ChatScreen when the contact has been erased.
 * Explains that messages are locked and how to restore.
 */

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function ErasedBanner({ contactNickname, onReAdd }) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.banner}>
        <Text style={styles.icon}>🔒</Text>
        <Text style={styles.title}>Contact erased</Text>
        <Text style={styles.body}>
          You removed <Text style={styles.accent}>{contactNickname}</Text>'s key.
          Existing messages are still stored on your device but are unreadable
          until you re-add them.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={onReAdd} activeOpacity={0.8}>
          <Text style={styles.btnText}>Scan their QR to restore</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { paddingHorizontal: 20, paddingVertical: 16 },
  banner:  { backgroundColor: 'rgba(248,113,113,0.08)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(248,113,113,0.2)', padding: 20, alignItems: 'center', gap: 10 },
  icon:    { fontSize: 32 },
  title:   { fontSize: 16, fontWeight: '700', color: '#F87171' },
  body:    { fontSize: 13, color: '#6B6B8A', textAlign: 'center', lineHeight: 20 },
  accent:  { color: '#C4B5FD', fontWeight: '600' },
  btn:     { marginTop: 4, backgroundColor: 'rgba(108,99,255,0.2)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20, borderWidth: 1, borderColor: 'rgba(108,99,255,0.4)' },
  btnText: { color: '#A78BFA', fontWeight: '700', fontSize: 13 },
});
