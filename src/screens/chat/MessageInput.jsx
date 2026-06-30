/**
 * MessageInput.jsx
 * Bottom input bar with a text field and send button.
 * Sends on button press or keyboard submit.
 */

import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Platform, ActivityIndicator,
} from 'react-native';

// Safe haptics wrapper — expo-haptics can crash on some Expo Go versions
async function triggerHaptic() {
  try {
    const Haptics = await import('expo-haptics');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptics unavailable — silently skip
  }
}

export default function MessageInput({ onSend, disabled }) {
  const [text,    setText]    = useState('');
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending || disabled) return;

    setSending(true);
    setText('');

    try {
      await onSend(trimmed);
      triggerHaptic();
    } catch (err) {
      console.error('[Input] Send error:', err.message);
      setText(trimmed); // restore on failure
    } finally {
      setSending(false);
    }
  }

  const canSend = text.trim().length > 0 && !sending && !disabled;

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Message…"
          placeholderTextColor="#3D3D5C"
          multiline
          maxLength={2000}
          returnKeyType="default"
          blurOnSubmit={false}
          editable={!disabled}
        />
        <TouchableOpacity
          style={[styles.sendBtn, canSend ? styles.sendBtnActive : styles.sendBtnInactive]}
          onPress={handleSend}
          disabled={!canSend}
          activeOpacity={0.8}
        >
          {sending
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.sendIcon}>↑</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:          { backgroundColor: '#0D0D0D', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 12, paddingVertical: 10 },
  container:        { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingLeft: 16, paddingRight: 6, paddingVertical: 6 },
  input:            { flex: 1, fontSize: 15, color: '#FFFFFF', maxHeight: 120, paddingVertical: Platform.OS === 'ios' ? 8 : 4, lineHeight: 22 },
  sendBtn:          { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  sendBtnActive:    { backgroundColor: '#6C63FF' },
  sendBtnInactive:  { backgroundColor: 'rgba(108,99,255,0.2)' },
  sendIcon:         { fontSize: 16, color: '#FFFFFF', fontWeight: '700' },
});
