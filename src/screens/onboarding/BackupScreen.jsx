/**
 * BackupScreen.jsx
 *
 * ⚠️ Progress indicator changed from a percentage bar back to a
 * spinner: the KDF now runs via react-native-argon2 (a native module
 * — see backupCrypto.js), which has no progress callback at all,
 * unlike the earlier hand-rolled, chunked JS loop. A spinner is the
 * honest representation of what's actually knowable here — a
 * fabricated percentage would be worse than no percentage. The good
 * news: since the computation now happens in native code rather than
 * on the JS thread, the UI genuinely stays responsive throughout —
 * this spinner will actually animate, unlike the original bug where
 * a blocking synchronous call prevented any indicator from painting
 * at all before the freeze began.
 */

import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Switch,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  exportBackup, shareBackup, deleteBackupFile,
  pickBackupFile, decryptAndImportBackup,
} from '../../services/backup';

export default function BackupScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [includeContacts, setIncludeContacts] = useState(true);
  const [includeMessages, setIncludeMessages] = useState(true);
  const [exportPassword, setExportPassword] = useState('');
  const [exportPasswordConfirm, setExportPasswordConfirm] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const [pickedEnvelope, setPickedEnvelope] = useState(null);
  const [importPassword, setImportPassword] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [picking, setPicking] = useState(false);

  async function handleExport() {
    if (exportPassword.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }
    if (exportPassword !== exportPasswordConfirm) {
      Alert.alert("Passwords don't match", 'Please re-enter both fields.');
      return;
    }

    setIsExporting(true);
    try {
      const uri = await exportBackup({
        includeContacts,
        includeMessages,
        password: exportPassword,
      });
      await shareBackup(uri);
      deleteBackupFile(uri);
      setExportPassword('');
      setExportPasswordConfirm('');
    } catch (err) {
      Alert.alert('Export failed', err.message);
    } finally {
      setIsExporting(false);
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

  function handleCancelPicked() {
    setPickedEnvelope(null);
    setImportPassword('');
  }

  async function handleDecryptAndImport() {
    Alert.alert(
      'Restore from backup?',
      'This replaces your current identity, contacts, and messages with whatever the backup file contains. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', style: 'destructive', onPress: doImport },
      ],
    );
  }

  async function doImport() {
    setIsImporting(true);
    try {
      const result = await decryptAndImportBackup(pickedEnvelope, importPassword);
      Alert.alert(
        'Restored',
        `Identity restored.\n` +
        `${result.restoredContacts} contact(s), ${result.restoredMessages} message(s) imported.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err) {
      if (err.code === 'wrong_password') {
        Alert.alert('Wrong password', 'That password did not work — try again.');
      } else {
        Alert.alert('Restore failed', err.message);
      }
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} disabled={isExporting || isImporting}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Backup & Restore</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Export</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Include contacts</Text>
          <Switch value={includeContacts} onValueChange={setIncludeContacts} trackColor={{ true: '#6C63FF' }} disabled={isExporting} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Include chat history</Text>
          <Switch value={includeMessages} onValueChange={setIncludeMessages} trackColor={{ true: '#6C63FF' }} disabled={isExporting} />
        </View>

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#3D3D5C"
          secureTextEntry
          value={exportPassword}
          onChangeText={setExportPassword}
          editable={!isExporting}
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm password"
          placeholderTextColor="#3D3D5C"
          secureTextEntry
          value={exportPasswordConfirm}
          onChangeText={setExportPasswordConfirm}
          editable={!isExporting}
        />

        <Text style={styles.hint}>
          You'll need this exact password to restore this backup later.
          There's no way to recover it if you forget it.
        </Text>

        <TouchableOpacity style={styles.actionBtn} onPress={handleExport} disabled={isExporting} activeOpacity={0.85}>
          {isExporting
            ? <View style={styles.busyRow}><ActivityIndicator color="#fff" /><Text style={styles.actionBtnText}>Encrypting…</Text></View>
            : <Text style={styles.actionBtnText}>Export Backup</Text>
          }
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Restore</Text>

        {!pickedEnvelope ? (
          <>
            <Text style={styles.hint}>
              Choose a previously exported backup file.
            </Text>
            <TouchableOpacity
              style={[styles.actionBtn, styles.restoreBtn]}
              onPress={handlePickFile}
              disabled={picking}
              activeOpacity={0.85}
            >
              <Text style={styles.restoreBtnText}>{picking ? 'Opening…' : 'Choose Backup File'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.pickedInfoBox}>
              <Text style={styles.pickedInfoText}>
                Backup found, exported {new Date(pickedEnvelope.exportedAt).toLocaleString()}
              </Text>
              {!isImporting && (
                <TouchableOpacity onPress={handleCancelPicked}>
                  <Text style={styles.pickedInfoChange}>Choose a different file</Text>
                </TouchableOpacity>
              )}
            </View>

            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#3D3D5C"
              secureTextEntry
              value={importPassword}
              onChangeText={setImportPassword}
              autoFocus
              editable={!isImporting}
            />

            <TouchableOpacity
              style={[styles.actionBtn, styles.restoreBtn]}
              onPress={handleDecryptAndImport}
              disabled={isImporting || importPassword.length === 0}
              activeOpacity={0.85}
            >
              {isImporting
                ? <View style={styles.busyRow}><ActivityIndicator color="#A78BFA" /><Text style={styles.restoreBtnText}>Decrypting…</Text></View>
                : <Text style={styles.restoreBtnText}>Decrypt & Restore</Text>
              }
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#0D0D0D', paddingHorizontal: 24 },
  backBtn:       { marginBottom: 16 },
  backText:      { color: '#6C63FF', fontSize: 15, fontWeight: '600' },
  title:         { fontSize: 24, fontWeight: '800', color: '#FFFFFF', marginBottom: 24 },

  section:       { marginBottom: 32 },
  sectionTitle:  { fontSize: 16, fontWeight: '700', color: '#FFFFFF', marginBottom: 14 },

  row:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  rowLabel:      { fontSize: 14, color: '#E0E0FF' },

  input:         { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(108,99,255,0.3)', paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: '#FFFFFF', marginTop: 12 },

  hint:          { fontSize: 12, color: '#6B6B8A', lineHeight: 18, marginTop: 12, marginBottom: 4 },

  actionBtn:     { backgroundColor: '#6C63FF', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  actionBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },

  restoreBtn:      { backgroundColor: 'rgba(108,99,255,0.15)', borderWidth: 1, borderColor: '#6C63FF' },
  restoreBtnText:  { color: '#A78BFA', fontWeight: '700', fontSize: 15 },

  busyRow:       { flexDirection: 'row', alignItems: 'center', gap: 10 },

  pickedInfoBox:   { backgroundColor: 'rgba(108,99,255,0.1)', borderRadius: 12, padding: 14, marginTop: 8 },
  pickedInfoText:  { color: '#C4B5FD', fontSize: 13, marginBottom: 8 },
  pickedInfoChange:{ color: '#6C63FF', fontSize: 13, fontWeight: '600' },
});
