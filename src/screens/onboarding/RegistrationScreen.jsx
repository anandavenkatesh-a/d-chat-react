/**
 * RegistrationScreen.jsx
 * Shown once, automatically, right after keys are generated (no
 * button press needed to reach it — App.js routes here directly
 * whenever identity exists but isRegistered is false).
 *
 * Drives registration.js's puzzle round trips: waits for a
 * puzzle_reveal from the relay, shows a tappable target, and reports
 * the tap the instant it happens — the relay measures the actual
 * elapsed time itself, this screen doesn't self-report any timing.
 */

import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { startRegistration } from '../../services/registration';
import useIdentityStore from '../../store/useIdentityStore';

const STAGE_CONNECTING = 'connecting';
const STAGE_WAITING    = 'waiting';   // waiting for next reveal — nothing to tap yet
const STAGE_ACTIVE     = 'active';    // target visible, waiting for tap
const STAGE_SUCCESS    = 'success';
const STAGE_FAILED     = 'failed';

export default function RegistrationScreen() {
  const insets = useSafeAreaInsets();
  const { confirmRegistered } = useIdentityStore();

  const [stage, setStage]         = useState(STAGE_CONNECTING);
  const [statusText, setStatusText] = useState('Getting ready…');
  const [round, setRound]         = useState(0);
  const [total, setTotal]         = useState(3);
  const [failReason, setFailReason] = useState(null);

  const regRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  // Guards against React re-invoking this mount effect (e.g. Strict
  // Mode's deliberate double-invoke in development, or any other
  // remount scenario) from firing a second, overlapping registration
  // attempt — the registration.js module now also guards against this
  // itself, but stopping the duplicate call here too means we don't
  // even bother starting (and then immediately aborting) an unwanted
  // second attempt.
  const hasStartedRef = useRef(false);

  function startFlow() {
    setStage(STAGE_CONNECTING);
    setFailReason(null);
    setRound(0);

    const reg = startRegistration({
      onStatusChange: (s) => setStatusText(s),
      onPuzzleRound: (r, t) => {
        setRound(r);
        setTotal(t);
        setStage(STAGE_ACTIVE);
        startPulse();
      },
    });
    regRef.current = reg;

    reg.result.then(async (result) => {
      if (result.success) {
        setStage(STAGE_SUCCESS);
        await confirmRegistered();
        // App.js will automatically switch to the main app now that
        // isRegistered flipped true — nothing else to do here.
      } else {
        setStage(STAGE_FAILED);
        setFailReason(result.reason || 'unknown_error');
      }
    });
  }

  useEffect(() => {
    if (hasStartedRef.current) return; // see hasStartedRef comment above
    hasStartedRef.current = true;
    startFlow();
  }, []);

  function startPulse() {
    pulseAnim.setValue(1);
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 400, useNativeDriver: true }),
      ])
    ).start();
  }

  async function handleTap() {
    if (stage !== STAGE_ACTIVE) return;
    setStage(STAGE_WAITING);
    setStatusText('Checking…');
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // haptics unavailable — fine, ignore
    }
    regRef.current?.submitTap();
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}>
      <Text style={styles.title}>One quick step</Text>
      <Text style={styles.subtitle}>
        Tap the circle as soon as it appears — this helps keep the{'\n'}
        network free of automated abuse, without collecting any{'\n'}
        personal information about you.
      </Text>

      <View style={styles.targetArea}>
        {stage === STAGE_CONNECTING && (
          <>
            <ActivityIndicator size="large" color="#6C63FF" />
            <Text style={styles.statusText}>{statusText}</Text>
          </>
        )}

        {stage === STAGE_WAITING && (
          <Text style={styles.waitingText}>Get ready…</Text>
        )}

        {stage === STAGE_ACTIVE && (
          <TouchableOpacity onPress={handleTap} activeOpacity={0.7}>
            <Animated.View style={[styles.tapTarget, { transform: [{ scale: pulseAnim }] }]}>
              <Text style={styles.tapTargetText}>TAP</Text>
            </Animated.View>
          </TouchableOpacity>
        )}

        {stage === STAGE_SUCCESS && (
          <>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successText}>You're all set!</Text>
          </>
        )}

        {stage === STAGE_FAILED && (
          <>
            <Text style={styles.failIcon}>✕</Text>
            <Text style={styles.failText}>
              {failReason === 'puzzle_failed'
                ? "That wasn't quite right — let's try again."
                : 'Something went wrong. Please try again.'}
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={startFlow} activeOpacity={0.85}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {(stage === STAGE_WAITING || stage === STAGE_ACTIVE) && (
        <Text style={styles.roundText}>Round {round} of {total}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#0D0D0D', alignItems: 'center', paddingHorizontal: 32 },
  title:         { fontSize: 26, fontWeight: '800', color: '#FFFFFF', marginBottom: 12, textAlign: 'center' },
  subtitle:      { fontSize: 14, color: '#6B6B8A', textAlign: 'center', lineHeight: 22, marginBottom: 48 },

  targetArea:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  statusText:    { fontSize: 13, color: '#4A4A6A', marginTop: 8 },
  waitingText:   { fontSize: 16, color: '#4A4A6A' },

  tapTarget:     { width: 140, height: 140, borderRadius: 70, backgroundColor: '#6C63FF', alignItems: 'center', justifyContent: 'center', shadowColor: '#6C63FF', shadowOpacity: 0.6, shadowRadius: 24, elevation: 12 },
  tapTargetText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', letterSpacing: 1 },

  successIcon:   { fontSize: 56, color: '#34D399' },
  successText:   { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },

  failIcon:      { fontSize: 56, color: '#F87171' },
  failText:      { fontSize: 15, color: '#FCA5A5', textAlign: 'center', paddingHorizontal: 20 },
  retryBtn:      { marginTop: 8, backgroundColor: '#6C63FF', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40 },
  retryBtnText:  { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },

  roundText:     { fontSize: 12, color: '#3D3D5C', marginTop: 24 },
});
