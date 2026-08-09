/**
 * ContactListScreen.jsx
 * Main home screen. Shows list of contacts with last message preview.
 *
 * Connection-awareness additions:
 *  - On first app launch, the contact list is fully gated behind a
 *    "Connecting to secure network…" overlay until the relay connection
 *    succeeds at least once. Prevents the false impression that the app
 *    is ready to send/receive before Tor + the relay handshake actually
 *    complete (which can take several seconds).
 *  - After that first successful connection, if the connection is later
 *    lost (backgrounded, network change, etc.), a small non-blocking
 *    banner explains that messages won't arrive until the app is
 *    reopened — since there's no always-on background service unless
 *    the optional persistent mode is enabled (not yet built).
 */

import { useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import useIdentityStore from '../../store/useIdentityStore';
import useContactsStore from '../../store/useContactsStore';
import useMessagesStore from '../../store/useMessagesStore';
import useConnectionStore from '../../store/useConnectionStore';
import { clearAllNotifications } from '../../services/notifications';

export default function ContactListScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { deviceId } = useIdentityStore();
  const { contacts, loadContacts } = useContactsStore();
  const { getMessages, loadMessages } = useMessagesStore();
  const { status, hasConnectedOnce } = useConnectionStore();

  useEffect(() => {
    contacts.forEach((c) => loadMessages(c.deviceId));
  }, [contacts.length]);

  useEffect(() => {
    clearAllNotifications();
  }, []);

  function getLastMessage(deviceId) {
    const msgs = getMessages(deviceId);
    return msgs.length > 0 ? msgs[msgs.length - 1] : null;
  }

  function getUnreadCount(deviceId) {
    const msgs = getMessages(deviceId);
    return msgs.filter((m) => m.direction === 'in' && m.status !== 'seen').length;
  }

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
    const lastMsg = getLastMessage(item.deviceId);
    const unread = getUnreadCount(item.deviceId);
    const initial = item.nickname[0].toUpperCase();
    const isErased = !item.publicKey;

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('Chat', {
          contactDeviceId: item.deviceId,
          contactNickname: item.nickname,
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
            <Text style={[styles.name, isErased && styles.nameErased]}>{item.nickname}</Text>
            <Text style={styles.time}>{formatTime(lastMsg)}</Text>
          </View>
          <Text
            style={[
              styles.preview,
              unread > 0 && !isErased && styles.previewUnread,
              isErased && styles.previewErased,
            ]}
            numberOfLines={1}
          >
            {isErased ? '🔒 Contact erased — tap to restore' : formatPreview(lastMsg)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  const isConnected = status === 'connected';
  const showFirstLaunchGate = !hasConnectedOnce; // full-screen block, first launch only
  const showBanner = hasConnectedOnce && !isConnected; // small banner after that

  return (
    <LinearGradient colors={['#0D0D0D', '#1A1035']} style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View>
          <Text style={styles.wordmark}>D-Chat</Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, isConnected ? styles.dotOn : styles.dotOff]} />
            <Text style={styles.statusText}>
              {deviceId ? deviceId.slice(0, 8) : '········'} · {isConnected ? 'connected' : status === 'connecting' ? 'connecting…' : 'offline'}
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
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('Backup')}
          activeOpacity={0.8}
        >
          <Text style={styles.addBtnText}>+ Backup</Text>
        </TouchableOpacity>
      </View>

      {/* Persistent banner — shown after the first successful connection,
          if we later lose it. Explains why new messages won't arrive
          silently in the background. */}
      {showBanner && (
        <View style={styles.banner}>
          <Text style={styles.bannerIcon}>⚠️</Text>
          <Text style={styles.bannerText}>
            Not connected. Keep D-Chat open to receive new messages —
            messages sent to you while you're offline wait on the server
            for up to 24 hours and arrive automatically next time you open the app.
          </Text>
        </View>
      )}

      {/* Full-screen gate — only on first launch, until the very first
          connection succeeds. Prevents interacting with a contact list
          that looks ready but can't actually send/receive yet. */}
      {showFirstLaunchGate ? (
        <View style={styles.gate}>
          <ActivityIndicator size="large" color="#6C63FF" />
          <Text style={styles.gateTitle}>Connecting to secure network…</Text>
          <Text style={styles.gateSub}>
            Routing through Tor for privacy.{'\n'}This can take up to 15 seconds on first launch.
          </Text>
        </View>
      ) : contacts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={styles.emptyTitle}>No contacts yet</Text>
          <Text style={styles.emptySub}>
            Tap <Text style={styles.emptyAccent}>+ Add</Text> and scan a{'\n'}
            contact's QR code to get started.
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
            <RefreshControl refreshing={false} onRefresh={loadContacts} tintColor="#6C63FF" />
          }
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  wordmark: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotOn: { backgroundColor: '#34D399' },
  dotOff: { backgroundColor: '#F59E0B' },
  statusText: { fontSize: 12, color: '#4A4A6A' },
  addBtn: { backgroundColor: 'rgba(108,99,255,0.2)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(108,99,255,0.4)' },
  addBtnText: { color: '#A78BFA', fontWeight: '700', fontSize: 14 },

  banner: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: 'rgba(245,158,11,0.1)', borderBottomWidth: 1, borderBottomColor: 'rgba(245,158,11,0.25)', paddingHorizontal: 20, paddingVertical: 12 },
  bannerIcon: { fontSize: 14, marginTop: 1 },
  bannerText: { flex: 1, fontSize: 12, color: '#FCD34D', lineHeight: 18 },

  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 16 },
  gateTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  gateSub: { fontSize: 13, color: '#4A4A6A', textAlign: 'center', lineHeight: 20 },

  list: { paddingTop: 8 },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(108,99,255,0.25)', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  avatarErased: { backgroundColor: 'rgba(248,113,113,0.1)' },
  avatarText: { fontSize: 20, fontWeight: '700', color: '#A78BFA' },
  badge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#6C63FF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { fontSize: 10, color: '#fff', fontWeight: '800' },

  info: { flex: 1 },
  infoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  name: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  nameErased: { color: '#6B6B8A' },
  time: { fontSize: 11, color: '#4A4A6A' },
  preview: { fontSize: 13, color: '#4A4A6A', lineHeight: 18 },
  previewUnread: { color: '#C4B5FD', fontWeight: '500' },
  previewErased: { color: '#F87171', fontStyle: 'italic' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon: { fontSize: 52, marginBottom: 18 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', marginBottom: 10 },
  emptySub: { fontSize: 14, color: '#4A4A6A', textAlign: 'center', lineHeight: 24 },
  emptyAccent: { color: '#A78BFA', fontWeight: '600' },
});
