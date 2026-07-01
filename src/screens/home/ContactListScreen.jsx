/**
 * ContactListScreen.jsx
 * Main home screen. Shows list of contacts with last message preview.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import useContactsStore  from '../../store/useContactsStore';
import useIdentityStore  from '../../store/useIdentityStore';
import useMessagesStore  from '../../store/useMessagesStore';
import { clearAllNotifications } from '../../services/notifications';

export default function ContactListScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [connected, setConnected] = useState(false);

  const username                   = useIdentityStore((s) => s.username);
  const contacts                   = useContactsStore((s) => s.contacts);
  const loadContacts               = useContactsStore((s) => s.loadContacts);
  // Subscribing to the whole messagesByContact map (not via a getter
  // function) ensures this screen re-renders whenever ANY message arrives
  // or changes status — which is what keeps the unread badge counts live.
  const messagesByContact          = useMessagesStore((s) => s.messagesByContact);
  const loadMessages               = useMessagesStore((s) => s.loadMessages);

  // Poll connection status safely without importing socket directly
  useEffect(() => {
    let mounted = true;
    async function checkConnection() {
      try {
        const { isConnected } = await import('../../services/socket');
        if (mounted) setConnected(isConnected());
      } catch {
        if (mounted) setConnected(false);
      }
    }
    checkConnection();
    const interval = setInterval(checkConnection, 3000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  useEffect(() => {
    contacts.forEach((c) => loadMessages(c.deviceId));
  }, [contacts.length]);

  // Re-pull messages from SQLite every time this screen regains focus
  // (e.g. coming back from a chat, or returning to the app from
  // background) so unread counts reflect anything that arrived while
  // the user was elsewhere.
  useFocusEffect(
    useCallback(() => {
      contacts.forEach((c) => loadMessages(c.deviceId));
      clearAllNotifications();
    }, [contacts.length])
  );

  function getLastMessage(deviceId) {
    const msgs = messagesByContact[deviceId] || [];
    return msgs.length > 0 ? msgs[msgs.length - 1] : null;
  }

  function getUnreadCount(deviceId) {
    const msgs = messagesByContact[deviceId] || [];
    return msgs.filter((m) => m.direction === 'in' && m.status !== 'seen').length;
  }

  const totalUnread = contacts.reduce((sum, c) => sum + getUnreadCount(c.deviceId), 0);

  function formatPreview(msg) {
    if (!msg) return 'Tap to start chatting';
    const text = msg.plaintext ?? '🔒 Encrypted message';
    const prefix = msg.direction === 'out' ? 'You: ' : '';
    const truncated = text.length > 40 ? text.slice(0, 40) + '…' : text;
    return prefix + truncated;
  }

  function formatTime(msg) {
    if (!msg) return '';
    const d = new Date(msg.timestamp);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function renderContact({ item }) {
    const lastMsg  = getLastMessage(item.deviceId);
    const unread   = getUnreadCount(item.deviceId);
    const isErased = !item.publicKey;
    const initial  = item.username ? item.username[0].toUpperCase() : '?';

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('Chat', {
          contactDeviceId: item.deviceId,
          contactUsername: item.username,
        })}
      >
        <View style={[styles.avatar, isErased && styles.avatarErased]}>
          <Text style={styles.avatarText}>{isErased ? '🔒' : initial}</Text>
          {unread > 0 && !isErased && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 9 ? '9+' : String(unread)}</Text>
            </View>
          )}
        </View>

        <View style={styles.info}>
          <View style={styles.infoTop}>
            <Text style={[styles.name, isErased && styles.nameErased]}>
              {'@' + item.username}
            </Text>
            <Text style={styles.time}>{formatTime(lastMsg)}</Text>
          </View>
          <Text style={[styles.preview, unread > 0 && !isErased && styles.previewUnread, isErased && styles.previewErased]} numberOfLines={1}>
            {isErased ? '🔒 Contact erased — tap to restore' : formatPreview(lastMsg)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View>
          <View style={styles.wordmarkRow}>
            <Text style={styles.wordmark}>D-Chat</Text>
            {totalUnread > 0 && (
              <View style={styles.totalBadge}>
                <Text style={styles.totalBadgeText}>
                  {totalUnread > 99 ? '99+' : String(totalUnread)}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.statusRow}>
            <View style={[styles.dot, connected ? styles.dotOn : styles.dotOff]} />
            <Text style={styles.statusText}>
              {'@' + username + ' · ' + (connected ? 'connected' : 'reconnecting…')}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('AddContact')}
          activeOpacity={0.8}
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {contacts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>{'💬'}</Text>
          <Text style={styles.emptyTitle}>No contacts yet</Text>
          <Text style={styles.emptySub}>
            {'Tap + Add and scan a contact\'s QR code to get started.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(c) => c.deviceId}
          renderItem={renderContact}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={loadContacts}
              tintColor="#6C63FF"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#0D0D0D' },

  header:        { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  wordmarkRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmark:      { fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  totalBadge:    { backgroundColor: '#6C63FF', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginBottom: 4 },
  totalBadgeText:{ fontSize: 11, color: '#fff', fontWeight: '800' },
  statusRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  dot:           { width: 7, height: 7, borderRadius: 4 },
  dotOn:         { backgroundColor: '#34D399' },
  dotOff:        { backgroundColor: '#6B6B8A' },
  statusText:    { fontSize: 12, color: '#4A4A6A' },
  addBtn:        { backgroundColor: 'rgba(108,99,255,0.2)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(108,99,255,0.4)' },
  addBtnText:    { color: '#A78BFA', fontWeight: '700', fontSize: 14 },

  list:          { paddingTop: 8 },

  row:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  avatar:        { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(108,99,255,0.25)', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  avatarErased:  { backgroundColor: 'rgba(248,113,113,0.1)' },
  avatarText:    { fontSize: 20, fontWeight: '700', color: '#A78BFA' },
  badge:         { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#6C63FF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText:     { fontSize: 10, color: '#fff', fontWeight: '800' },

  info:          { flex: 1 },
  infoTop:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  name:          { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  nameErased:    { color: '#6B6B8A' },
  time:          { fontSize: 11, color: '#4A4A6A' },
  preview:       { fontSize: 13, color: '#4A4A6A', lineHeight: 18 },
  previewUnread: { color: '#C4B5FD', fontWeight: '500' },
  previewErased: { color: '#F87171', fontStyle: 'italic' },

  empty:         { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon:     { fontSize: 52, marginBottom: 18 },
  emptyTitle:    { fontSize: 22, fontWeight: '700', color: '#FFFFFF', marginBottom: 10 },
  emptySub:      { fontSize: 14, color: '#4A4A6A', textAlign: 'center', lineHeight: 24 },
});
