/**
 * WelcomeChoiceScreen.jsx
 * Shown on a genuinely first-ever launch (no identity exists locally
 * yet) — lets the user choose between generating a brand new identity
 * or restoring a previous one from a backup file, rather than always
 * silently generating a fresh identity as before.
 *
 * "Restore" reuses the exact same pickBackupFile()/decryptAndImportBackup()
 * functions BackupScreen.jsx uses from its settings-accessible restore
 * flow — those don't require an existing identity to run (they call
 * importIdentity(), which sets identity from scratch regardless of
 * whether one existed before), so no separate import logic was needed
 * here, just a second UI entry point into the same underlying flow.
 */

import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import useIdentityStore from '../../store/useIdentityStore';
import { pickBackupFile, decryptAndImportBackup } from '../../services/backup';

const MODE_CHOOSE  = 'choose';
const MODE_RESTORE = 'restore';

export default function WelcomeChoiceScreen() {
  const insets = useSafeAreaInsets();
  const { createIdentity } = useIdentityStore();

  const [mode, setMode] = useState(MODE_CHOOSE);
  const [creating, setCreating] = useState(false);
  const [pickedEnvelope, setPickedEnvelope] = useState(null);
  const [password, setPassword] = useState('');
  const [picking, setPicking] = useState(false);
  const [restoring, setRestoring] = useState(false);

  async function handleCreateNew() {
    setCreating(true);
    try {
      await createIdentity();
    } catch (err) {
      Alert.alert('Something went wrong', err.message);
      setCreating(false);
    }
  }

  async function handlePickFile() {
    setPicking(true);
    try {
      const envelope = await pickBackupFile();
      if (envelope) setPickedEnvelope(envelope);
    } catch (err) {
      Alert.alert('Could not read file', err.message);
    } finally {
      setPicking(false);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    try {
      await decryptAndImportBackup(pickedEnvelope, password);
    } catch (err) {
      if (err.code === 'wrong_password') {
        Alert.alert('Wrong password', 'That password did not work — try again.');
      } else {
        Alert.alert('Restore failed', err.message);
      }
      setRestoring(false);
    }
  }

  if (mode === MODE_CHOOSE) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}>
        <View style={styles.header}>
          <Text style={styles.logo}>🔒</Text>
          <Text style={styles.title}>Welcome to D-Chat</Text>
          <Text style={styles.subtitle}>Private, end-to-end encrypted messaging</Text>
        </View>

        <View style={styles.choices}>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleCreateNew} disabled={creating} activeOpacity={0.85}>
            {creating
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryBtnText}>Create New Account</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setMode(MODE_RESTORE)} activeOpacity={0.85}>
            <Text style={styles.secondaryBtnText}>Restore from Backup</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}>
      <TouchableOpacity onPress={() => setMode(MODE_CHOOSE)} style={styles.backBtn}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.header}>
        <Text style={styles.title}>Restore from Backup</Text>
        <Text style={styles.subtitle}>Choose your backup file and enter its password</Text>
      </View>

      <View style={styles.choices}>
        {!pickedEnvelope ? (
          <TouchableOpacity style={styles.secondaryBtn} onPress={handlePickFile} disabled={picking} activeOpacity={0.85}>
            {picking
              ? <ActivityIndicator color="#A78BFA" />
              : <Text style={styles.secondaryBtnText}>Choose Backup File</Text>
            }
          </TouchableOpacity>
        ) : (
          <>
            <View style={styles.pickedInfoBox}>
              <Text style={styles.pickedInfoText}>
                Backup found, exported {new Date(pickedEnvelope.exportedAt).toLocaleString()}
              </Text>
              <TouchableOpacity onPress={() => { setPickedEnvelope(null); setPassword(''); }}>
                <Text style={styles.pickedInfoChange}>Choose a different file</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#3D3D5C"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              autoFocus
              editable={!restoring}
            />

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleRestore}
              disabled={restoring || password.length === 0}
              activeOpacity={0.85}
            >
              {restoring
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryBtnText}>Decrypt & Restore</Text>
              }
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#0D0D0D', paddingHorizontal: 32, justifyContent: 'center' },
  backBtn:       { position: 'absolute', top: 60, left: 24 },
  backText:      { color: '#6C63FF', fontSize: 15, fontWeight: '600' },

  header:        { alignItems: 'center', marginBottom: 48 },
  logo:          { fontSize: 52, marginBottom: 16 },
  title:         { fontSize: 26, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', marginBottom: 8 },
  subtitle:      { fontSize: 14, color: '#6B6B8A', textAlign: 'center' },

  choices:       { gap: 14 },

  primaryBtn:    { backgroundColor: '#6C63FF', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  primaryBtnText:{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 },

  secondaryBtn:  { backgroundColor: 'rgba(108,99,255,0.12)', borderWidth: 1, borderColor: 'rgba(108,99,255,0.4)', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  secondaryBtnText: { color: '#A78BFA', fontWeight: '700', fontSize: 16 },

  input:         { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(108,99,255,0.3)', paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#FFFFFF', marginBottom: 14 },

  pickedInfoBox:   { backgroundColor: 'rgba(108,99,255,0.1)', borderRadius: 12, padding: 14, marginBottom: 14 },
  pickedInfoText:  { color: '#C4B5FD', fontSize: 13, marginBottom: 8 },
  pickedInfoChange:{ color: '#6C63FF', fontSize: 13, fontWeight: '600' },

  progressWrap:  { marginTop: 4 },
  progressLabel: { color: '#A78BFA', fontSize: 13, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  progressFill:  { height: '100%', backgroundColor: '#6C63FF', borderRadius: 4 },
});
