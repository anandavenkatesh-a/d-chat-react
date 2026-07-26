/**
 * MessageInput.jsx
 * Bottom input bar with a text field and send button.
 *
 * Double-send guard: `sendingRef` (a ref, checked and set SYNCHRONOUSLY
 * before any async work starts) makes it impossible for a rapid
 * double-tap on Send — or a tap that lands awkwardly during a keyboard
 * layout transition — to fire handleSend() twice for the same message.
 * The earlier `sending` state alone wasn't sufficient: state updates
 * are asynchronous in React, so two taps arriving within the same
 * render frame could both read `sending` as still false before either
 * update had applied. A ref updates immediately, synchronously, with
 * no such window.
 */

import { useState, useRef } from 'react';
import {
  View, TextInput, TouchableOpacity, StyleSheet,
  Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export default function MessageInput({ onSend, disabled }) {
  const [text,    setText]    = useState('');
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false); // see file header comment

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    if (sendingRef.current) return; // synchronous guard — see header comment
    sendingRef.current = true;

    setSending(true);
    setText('');

    try {
      await onSend(trimmed);
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // haptics unavailable — fine, ignore
      }
    } catch (err) {
      console.error('[Input] Send error:', err.message);
      setText(trimmed); // restore on failure
    } finally {
      setSending(false);
      sendingRef.current = false;
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
            : <Ionicons name="send" size={16} color="#FFFFFF" style={styles.sendIcon} />
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
  // Paper plane icons visually sit slightly left-of-center by default —
  // nudging right centers it more precisely inside the round button.
  sendIcon:         { marginLeft: 2 },
});
