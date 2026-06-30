/**
 * AddContactScreen.jsx
 * Two-tab screen: "My QR" (show own code) and "Scan" (scan contact's code).
 */

import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MyQRCode from './MyQRCode';
import ScanQR   from './ScanQR';

const TABS = ['My QR', 'Scan'];

export default function AddContactScreen({ navigation }) {
  const [tab, setTab] = useState(0);
  const insets = useSafeAreaInsets();

  function handleContactAdded({ username }) {
    navigation.goBack();
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Contact</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Tab switcher */}
      <View style={styles.tabs}>
        {TABS.map((label, i) => (
          <TouchableOpacity
            key={label}
            style={[styles.tab, tab === i && styles.tabActive]}
            onPress={() => setTab(i)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, tab === i && styles.tabTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      <View style={styles.content}>
        {tab === 0
          ? <MyQRCode />
          : <ScanQR onContactAdded={handleContactAdded} />
        }
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D0D' },

  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16 },
  backBtn:       { width: 64 },
  backText:      { color: '#6C63FF', fontSize: 15, fontWeight: '600' },
  headerTitle:   { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },

  tabs:          { flexDirection: 'row', marginHorizontal: 28, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 4, marginBottom: 8 },
  tab:           { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive:     { backgroundColor: 'rgba(108,99,255,0.4)' },
  tabText:       { fontSize: 14, fontWeight: '600', color: '#4A4A6A' },
  tabTextActive: { color: '#C4B5FD' },

  content:       { flex: 1 },
});
