/**
 * StatusTick.jsx
 * Renders message delivery status as tick marks.
 *
 *  ✓    = sent (relay received it)
 *  ✓✓   = stored (saved on recipient's device)
 *  ✓✓✓  = seen (recipient opened the chat) — shown in purple
 */

import { Text, StyleSheet } from 'react-native';
import { MSG_STATUS } from '../../constants/config';

export default function StatusTick({ status }) {
  if (!status) return null;

  if (status === MSG_STATUS.SEEN)   return <Text style={[styles.base, styles.seen]}>✓✓✓</Text>;
  if (status === MSG_STATUS.STORED) return <Text style={[styles.base, styles.stored]}>✓✓</Text>;
  if (status === MSG_STATUS.SENT)   return <Text style={[styles.base, styles.sent]}>✓</Text>;

  return null;
}

const styles = StyleSheet.create({
  base:   { fontSize: 11, fontWeight: '600', marginLeft: 4 },
  sent:   { color: '#4A4A6A' },
  stored: { color: '#7C7CAA' },
  seen:   { color: '#A78BFA' },
});
