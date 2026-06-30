/**
 * HomePlaceholder.jsx
 * Temporary home screen — shows contacts list and Add Contact button.
 * Replaced fully in Phase 6.
 */

import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useIdentityStore  from '../../store/useIdentityStore';
import useContactsStore  from '../../store/useContactsStore';

export default function HomePlaceholder({ navigation }) {
  const { username } = useIdentityStore();
  const { contacts } = useContactsStore();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View>
          <Text style={styles.wordmark}>D-Chat</Text>
          <Text style={styles.username}>@{username}</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('AddContact')}
          activeOpacity={0.8}
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Contacts */}
      {contacts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={styles.emptyTitle}>No contacts yet</Text>
          <Text style={styles.emptySub}>
            Tap <Text style={styles.emptyAccent}>+ Add</Text> to scan a contact's QR code{'\n'}or share yours so they can add you.
          </Text>
        </View>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(c) => c.deviceId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.contactRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.username[0].toUpperCase()}</Text>
              </View>
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>@{item.username}</Text>
                <Text style={styles.contactId} numberOfLines={1} ellipsizeMode="middle">
                  {item.deviceId}
                </Text>
              </View>
              <Text style={styles.arrow}>›</Text>
            </View>
          )}
        />
      )}

      <Text style={[styles.hint, { paddingBottom: insets.bottom + 12 }]}>
        Full chat UI coming in Phase 6 ✦
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D0D' },

  header:       { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  wordmark:     { fontSize: 26, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  username:     { fontSize: 13, color: '#6B6B8A', marginTop: 2 },
  addBtn:       { backgroundColor: 'rgba(108,99,255,0.25)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(108,99,255,0.5)' },
  addBtnText:   { color: '#A78BFA', fontWeight: '700', fontSize: 14 },

  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon:    { fontSize: 48, marginBottom: 16 },
  emptyTitle:   { fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginBottom: 10 },
  emptySub:     { fontSize: 14, color: '#4A4A6A', textAlign: 'center', lineHeight: 22 },
  emptyAccent:  { color: '#A78BFA', fontWeight: '600' },

  list:         { paddingHorizontal: 20, paddingTop: 12 },
  contactRow:   { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  avatar:       { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(108,99,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  avatarText:   { fontSize: 18, fontWeight: '700', color: '#A78BFA' },
  contactInfo:  { flex: 1 },
  contactName:  { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  contactId:    { fontSize: 11, color: '#3D3D5C', marginTop: 2, fontFamily: 'monospace' },
  arrow:        { fontSize: 20, color: '#3D3D5C' },

  hint:         { textAlign: 'center', color: '#2D2D4A', fontSize: 12, paddingTop: 8 },
});
