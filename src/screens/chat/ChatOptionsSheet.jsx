/**
 * ChatOptionsSheet.jsx
 * Bottom sheet that slides up when user taps ⋮ in chat header.
 * Contains: Erase Contact option (and future options like block, etc.)
 *
 * Built with pure RN Modal — no extra library needed.
 */

import {
  Modal, View, Text, StyleSheet, TouchableOpacity,
  TouchableWithoutFeedback, Animated,
} from 'react-native';
import { useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ChatOptionsSheet({ visible, onClose, onErase, contactUsername }) {
  const insets    = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 16 },
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle */}
        <View style={styles.handle} />

        {/* Contact label */}
        <Text style={styles.contactLabel}>@{contactUsername}</Text>

        {/* Options */}
        <View style={styles.options}>

          {/* Erase */}
          <TouchableOpacity style={styles.option} onPress={onErase} activeOpacity={0.7}>
            <View style={[styles.optionIcon, styles.eraseIcon]}>
              <Text style={styles.optionEmoji}>🗑</Text>
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Erase Contact</Text>
              <Text style={styles.optionSub}>
                Removes their key. Messages stay encrypted on your device.
                Re-scan their QR to restore access.
              </Text>
            </View>
          </TouchableOpacity>

        </View>

        {/* Cancel */}
        <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },

  sheet:        { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#1A1A2E', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingHorizontal: 20 },
  handle:       { width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },

  contactLabel: { fontSize: 13, color: '#4A4A6A', fontWeight: '600', textAlign: 'center', marginBottom: 20, letterSpacing: 0.5 },

  options:      { gap: 4, marginBottom: 16 },

  option:       { flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  optionIcon:   { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  eraseIcon:    { backgroundColor: 'rgba(248,113,113,0.15)' },
  optionEmoji:  { fontSize: 18 },
  optionText:   { flex: 1 },
  optionTitle:  { fontSize: 15, fontWeight: '700', color: '#F87171', marginBottom: 4 },
  optionSub:    { fontSize: 12, color: '#4A4A6A', lineHeight: 18 },

  cancelBtn:    { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  cancelText:   { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
