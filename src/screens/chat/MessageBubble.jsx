/**
 * MessageBubble.jsx
 * A single chat message bubble.
 * Own messages → right, purple gradient
 * Incoming      → left, dark surface
 */

import { View, Text, StyleSheet } from 'react-native';
import StatusTick from './StatusTick';

function formatTime(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MessageBubble({ message }) {
  const isOwn = message.direction === 'out';
  const text  = message.plaintext ?? '🔒 Encrypted';

  return (
    <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}>
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        <Text style={[styles.text, isOwn ? styles.textOwn : styles.textOther]}>
          {text}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.time, isOwn ? styles.timeOwn : styles.timeOther]}>
            {formatTime(message.timestamp)}
          </Text>
          {isOwn && <StatusTick status={message.status} />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row:          { paddingHorizontal: 16, marginVertical: 3, flexDirection: 'row' },
  rowOwn:       { justifyContent: 'flex-end' },
  rowOther:     { justifyContent: 'flex-start' },

  bubble:       { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleOwn:    { backgroundColor: '#6C63FF', borderBottomRightRadius: 4 },
  bubbleOther:  { backgroundColor: 'rgba(255,255,255,0.08)', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },

  text:         { fontSize: 15, lineHeight: 22 },
  textOwn:      { color: '#FFFFFF' },
  textOther:    { color: '#E0E0FF' },

  meta:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4, gap: 2 },
  time:         { fontSize: 10 },
  timeOwn:      { color: 'rgba(255,255,255,0.55)' },
  timeOther:    { color: '#4A4A6A' },
});
