/**
 * ChatScreen.jsx
 * Full chat thread for a single contact.
 *
 * Bug fix: "seen" (✓✓✓) must only be sent when the user's screen is
 * actually ON and this specific chat is the focused screen — not
 * merely when this component happens to still be mounted while a
 * message arrives (e.g. phone screen off, app kept alive in the
 * background by the persistent Tor/WebSocket connection). Previously,
 * markAsSeen() fired purely off `messages.length` changing, with no
 * check on AppState or navigation focus, so a message could be
 * acknowledged as "seen" while the recipient's screen was off.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform, AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';

import MessageBubble     from './MessageBubble';
import MessageInput      from './MessageInput';
import ChatOptionsSheet  from './ChatOptionsSheet';
import ErasedBanner      from './ErasedBanner';
import useMessagesStore  from '../../store/useMessagesStore';
import useContactsStore  from '../../store/useContactsStore';
import useIdentityStore  from '../../store/useIdentityStore';

export default function ChatScreen({ route, navigation }) {
  const { contactDeviceId, contactUsername } = route.params;
  const insets   = useSafeAreaInsets();
  const listRef  = useRef(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const appStateRef = useRef(AppState.currentState);
  const isFocused = useIsFocused();

  const { privateKey }                                          = useIdentityStore();
  const { getContact, eraseContact }                            = useContactsStore();
  const { loadMessages, sendMessage, markAsSeen, getMessages }  = useMessagesStore();

  const contact  = getContact(contactDeviceId);
  const messages = getMessages(contactDeviceId);
  const isErased = !contact;

  /**
   * The ONLY correct condition for "the user is actually looking at this
   * chat right now": app is foregrounded AND this screen is the focused
   * route in the navigator. Screen-off, backgrounded, or navigated-away
   * (even if this component is still mounted deeper in the stack) must
   * never satisfy this.
   */
  function isActivelyViewing() {
    return AppState.currentState === 'active' && isFocused;
  }

  function markSeenIfActivelyViewing() {
    if (isActivelyViewing()) {
      markAsSeen(contactDeviceId);
    }
  }

  // Load messages once on mount; only mark seen if genuinely being viewed
  useEffect(() => {
    loadMessages(contactDeviceId);
    markSeenIfActivelyViewing();
  }, [contactDeviceId]);

  // New messages arrived — only mark seen if genuinely being viewed,
  // and scroll to bottom regardless (that's a harmless UI action, not
  // a privacy-sensitive acknowledgement).
  useEffect(() => {
    if (messages.length > 0) {
      markSeenIfActivelyViewing();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  // Re-check when the app returns to foreground OR this screen regains
  // focus — this is what correctly marks messages as seen the moment
  // the user actually turns the screen back on / navigates back here,
  // rather than silently and prematurely when they arrived.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appStateRef.current !== 'active';
      appStateRef.current = nextState;
      if (wasBackground && nextState === 'active' && isFocused) {
        markAsSeen(contactDeviceId);
      }
    });
    return () => subscription.remove();
  }, [contactDeviceId, isFocused]);

  useEffect(() => {
    if (isFocused) {
      markSeenIfActivelyViewing();
    }
  }, [isFocused]);

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async (plaintext) => {
    if (!contact) return;
    await sendMessage({
      plaintext,
      recipientDeviceId:  contactDeviceId,
      recipientPublicKey: contact.publicKey,
      senderPrivateKey:   privateKey,
    });
  }, [contact, contactDeviceId, privateKey]);

  // ── Erase ─────────────────────────────────────────────────────────────────
  async function handleErase() {
    setSheetVisible(false);
    setTimeout(() => {
      Alert.alert(
        'Erase Contact',
        `Remove @${contactUsername}?\n\nYour messages stay encrypted on your device. Re-scan their QR code to restore access.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Erase',
            style: 'destructive',
            onPress: async () => {
              await eraseContact(contactDeviceId);
            },
          },
        ]
      );
    }, 300);
  }

  function handleReAdd() {
    navigation.navigate('AddContact');
  }

  function renderItem({ item, index }) {
    const prev     = messages[index - 1];
    const showDate = !prev || !isSameDay(prev.timestamp, item.timestamp);
    return (
      <>
        {showDate && <DateSeparator timestamp={item.timestamp} />}
        <MessageBubble message={item} />
      </>
    );
  }

  return (
    <LinearGradient colors={['#0D0D0D', '#1A1035']} style={styles.root}>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <View style={[styles.avatar, isErased && styles.avatarErased]}>
            <Text style={styles.avatarText}>
              {contactUsername[0].toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.headerName}>@{contactUsername}</Text>
            <Text style={[styles.headerSub, isErased && styles.headerSubErased]}>
              {isErased ? '🔒 Contact erased' : 'End-to-end encrypted'}
            </Text>
          </View>
        </View>

        {!isErased && (
          <TouchableOpacity
            style={styles.menuBtn}
            onPress={() => setSheetVisible(true)}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.menuIcon}>⋮</Text>
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {isErased && (
          <ErasedBanner contactUsername={contactUsername} onReAdd={handleReAdd} />
        )}

        {messages.length === 0 && !isErased ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔒</Text>
            <Text style={styles.emptyText}>
              Messages are end-to-end encrypted.{'\n'}Say hello!
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() =>
              listRef.current?.scrollToEnd({ animated: false })
            }
          />
        )}

        <View style={{ paddingBottom: insets.bottom }}>
          <MessageInput onSend={handleSend} disabled={isErased} />
        </View>
      </KeyboardAvoidingView>

      <ChatOptionsSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onErase={handleErase}
        contactUsername={contactUsername}
      />
    </LinearGradient>
  );
}

function DateSeparator({ timestamp }) {
  return (
    <View style={sep.row}>
      <View style={sep.line} />
      <Text style={sep.text}>{formatDateLabel(timestamp)}</Text>
      <View style={sep.line} />
    </View>
  );
}

function isSameDay(ts1, ts2) {
  const a = new Date(ts1), b = new Date(ts2);
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function formatDateLabel(timestamp) {
  const d   = new Date(timestamp);
  const now = new Date();
  if (isSameDay(timestamp, now.getTime())) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(timestamp, yesterday.getTime())) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  root:          { flex: 1 },
  flex:          { flex: 1 },

  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  backBtn:       { width: 36, alignItems: 'flex-start' },
  backText:      { fontSize: 22, color: '#6C63FF', fontWeight: '300' },
  headerCenter:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar:        { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(108,99,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  avatarErased:  { backgroundColor: 'rgba(248,113,113,0.15)' },
  avatarText:    { fontSize: 16, fontWeight: '700', color: '#A78BFA' },
  headerName:    { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  headerSub:     { fontSize: 11, color: '#3D3D5C', marginTop: 1 },
  headerSubErased: { color: '#F87171' },
  menuBtn:       { width: 36, alignItems: 'flex-end' },
  menuIcon:      { fontSize: 22, color: '#6B6B8A', letterSpacing: -2 },

  list:          { paddingVertical: 12 },

  empty:         { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon:     { fontSize: 40, marginBottom: 14 },
  emptyText:     { fontSize: 14, color: '#3D3D5C', textAlign: 'center', lineHeight: 22 },
});

const sep = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', marginVertical: 12, paddingHorizontal: 20 },
  line:  { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  text:  { fontSize: 11, color: '#3D3D5C', marginHorizontal: 12, fontWeight: '600' },
});
