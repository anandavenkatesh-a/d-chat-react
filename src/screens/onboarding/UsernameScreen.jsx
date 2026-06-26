/**
 * UsernameScreen.jsx
 * User picks a username → keypair is generated → identity is created.
 */

import { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import useIdentityStore from '../../store/useIdentityStore';

const { width } = Dimensions.get('window');

const RULES = [
  { test: (v) => v.length >= 3,          label: 'At least 3 characters' },
  { test: (v) => v.length <= 24,         label: 'At most 24 characters' },
  { test: (v) => /^[a-z0-9_]+$/.test(v), label: 'Lowercase letters, numbers, _ only' },
];

export default function UsernameScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { createIdentity } = useIdentityStore();

  const [value,   setValue]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const normalized  = value.trim().toLowerCase();
  const ruleResults = RULES.map((r) => ({ ...r, pass: r.test(normalized) }));
  const isValid     = ruleResults.every((r) => r.pass);

  async function handleCreate() {
    if (!isValid || loading) return;
    setLoading(true);
    setError(null);
    try {
      await createIdentity(normalized);
      navigation.navigate('IdentityCreated');
    } catch (err) {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={['#0D0D0D', '#1A1035']} style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.inner, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]}>

          {/* Back */}
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Choose your{'\n'}username</Text>
            <Text style={styles.subtitle}>
              This is how your contacts will identify you.{'\n'}
              It cannot be changed later.
            </Text>
          </View>

          {/* Input */}
          <View style={styles.inputWrapper}>
            <Text style={styles.atSign}>@</Text>
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={setValue}
              placeholder="your_username"
              placeholderTextColor="#3D3D5C"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              maxLength={24}
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
          </View>

          {/* Validation rules */}
          <View style={styles.rules}>
            {ruleResults.map((r) => (
              <View key={r.label} style={styles.ruleRow}>
                <Text style={[styles.ruleDot, normalized.length > 0 && (r.pass ? styles.pass : styles.fail)]}>
                  {normalized.length === 0 ? '·' : r.pass ? '✓' : '✗'}
                </Text>
                <Text style={[styles.ruleText, normalized.length > 0 && (r.pass ? styles.passText : styles.failText)]}>
                  {r.label}
                </Text>
              </View>
            ))}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          {/* Spacer */}
          <View style={styles.flex} />

          {/* CTA */}
          <TouchableOpacity
            style={[styles.btn, !isValid && styles.btnDisabled]}
            activeOpacity={isValid ? 0.85 : 1}
            onPress={handleCreate}
            disabled={!isValid || loading}
          >
            <LinearGradient
              colors={isValid ? ['#6C63FF', '#A78BFA'] : ['#2A2A3D', '#2A2A3D']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.btnGradient}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={[styles.btnText, !isValid && styles.btnTextDisabled]}>
                    Create identity
                  </Text>
              }
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.note}>
            🔑 A unique encryption key pair will be generated on your device.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root:            { flex: 1 },
  flex:            { flex: 1 },
  inner:           { flex: 1, paddingHorizontal: 28 },

  back:            { marginBottom: 32 },
  backText:        { color: '#6C63FF', fontSize: 15, fontWeight: '600' },

  header:          { marginBottom: 36 },
  title:           { fontSize: 34, fontWeight: '800', color: '#FFFFFF', lineHeight: 42, letterSpacing: -0.5 },
  subtitle:        { fontSize: 14, color: '#6B6B8A', marginTop: 12, lineHeight: 22 },

  inputWrapper:    { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(108,99,255,0.4)', paddingHorizontal: 16, marginBottom: 24 },
  atSign:          { fontSize: 20, color: '#6C63FF', fontWeight: '700', marginRight: 6 },
  input:           { flex: 1, fontSize: 20, color: '#FFFFFF', paddingVertical: 16, fontWeight: '600', letterSpacing: 0.5 },

  rules:           { gap: 10 },
  ruleRow:         { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ruleDot:         { fontSize: 14, color: '#3D3D5C', width: 16, textAlign: 'center' },
  ruleText:        { fontSize: 13, color: '#4A4A6A' },
  pass:            { color: '#34D399' },
  fail:            { color: '#F87171' },
  passText:        { color: '#6EE7B7' },
  failText:        { color: '#FCA5A5' },

  error:           { color: '#F87171', fontSize: 13, marginTop: 16, textAlign: 'center' },

  btn:             { borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  btnDisabled:     { opacity: 0.5 },
  btnGradient:     { paddingVertical: 18, alignItems: 'center' },
  btnText:         { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  btnTextDisabled: { color: '#555570' },

  note:            { fontSize: 12, color: '#3D3D5C', textAlign: 'center', lineHeight: 18, paddingHorizontal: 16 },
});
