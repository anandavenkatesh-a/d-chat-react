/**
 * RegistrationScreen.jsx
 *
 * Instructions stage redesigned: previously a single paragraph with
 * manual '\n' line breaks, which looked scattered and didn't reflow
 * naturally across different screen widths. Replaced with a
 * structured, scannable 3-step layout (icon + short title +
 * description per step) plus a smaller, visually separated privacy
 * footnote — much easier to read at a glance than one dense block of
 * text.
 *
 * Everything else (tap-counter puzzle mechanics, audio playback,
 * auto-submit after the final chunk) is unchanged from before.
 */

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

import { startRegistration } from '../../services/registration';
import useIdentityStore from '../../store/useIdentityStore';

const STAGE_INSTRUCTIONS = 'instructions';
const STAGE_CONNECTING   = 'connecting';
const STAGE_LISTENING    = 'listening';
const STAGE_CHECKING     = 'checking';
const STAGE_SUCCESS      = 'success';
const STAGE_FAILED       = 'failed';

const STEPS = [
  { icon: '🎧', title: 'Listen',   desc: "You'll hear a series of tones over about a minute, mixed in with background sound." },
  { icon: '👆', title: 'Tap',      desc: 'Tap the button the instant you hear a HIGH-pitched tone — right when you hear it.' },
  { icon: '✅', title: 'Done',     desc: 'Your count submits automatically the moment the audio ends. No typing needed.' },
];

export default function RegistrationScreen() {
  const insets = useSafeAreaInsets();
  const { confirmRegistered } = useIdentityStore();

  const [stage, setStage]           = useState(STAGE_INSTRUCTIONS);
  const [statusText, setStatusText] = useState('Getting ready…');
  const [chunkIndex, setChunkIndex] = useState(0);
  const [chunkTotal, setChunkTotal] = useState(0);
  const [tapCount, setTapCount]     = useState(0);
  const [failReason, setFailReason] = useState(null);

  const regRef = useRef(null);
  const playerRef = useRef(null);
  const tapCountRef = useRef(0);
  const hasSubmittedRef = useRef(false);
  const finalChunkTimerRef = useRef(null);
  const chunkDurationRef = useRef(2000);

  function playChunk(base64Wav) {
    try {
      playerRef.current?.remove?.();
      playerRef.current = createAudioPlayer({ uri: `data:audio/wav;base64,${base64Wav}` });
      playerRef.current.volume = 0.8;
      playerRef.current.play();
    } catch (err) {
      console.warn('[Registration] Failed to play chunk:', err.message);
    }
  }

  function handleTap() {
    tapCountRef.current += 1;
    setTapCount(tapCountRef.current);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }

  function submitCurrentAnswer() {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    setStage(STAGE_CHECKING);
    regRef.current?.submitAnswer(tapCountRef.current);
  }

  function beginPuzzle() {
    setStage(STAGE_CONNECTING);
    setFailReason(null);
    setChunkIndex(0);
    setChunkTotal(0);
    setTapCount(0);
    tapCountRef.current = 0;
    hasSubmittedRef.current = false;

    const reg = startRegistration({
      onStatusChange: (s) => setStatusText(s),

      onSessionStart: (total, chunkDurationMs) => {
        setChunkTotal(total);
        if (chunkDurationMs) chunkDurationRef.current = chunkDurationMs;
        setStage(STAGE_LISTENING);
      },

      onChunk: (chunk) => {
        setChunkIndex(chunk.index + 1);
        playChunk(chunk.audioBase64);

        if (chunk.isFinal) {
          finalChunkTimerRef.current = setTimeout(() => {
            submitCurrentAnswer();
          }, chunkDurationRef.current);
        }
      },

      onAnswerWindowOpen: () => {
        submitCurrentAnswer();
      },
    });
    regRef.current = reg;

    reg.result.then(async (result) => {
      if (finalChunkTimerRef.current) clearTimeout(finalChunkTimerRef.current);

      if (result.success) {
        setStage(STAGE_SUCCESS);
        await confirmRegistered();
      } else {
        setStage(STAGE_FAILED);
        setFailReason(result.reason || 'unknown_error');
      }
    });
  }

  useEffect(() => {
    return () => {
      if (finalChunkTimerRef.current) clearTimeout(finalChunkTimerRef.current);
      playerRef.current?.remove?.();
    };
  }, []);

  function handleReturnToInstructions() {
    setStage(STAGE_INSTRUCTIONS);
  }

  const isListening = stage === STAGE_LISTENING;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}>

      {stage === STAGE_INSTRUCTIONS && (
        <View style={styles.instructionsWrap}>
          <Text style={styles.headerIcon}>🎧</Text>
          <Text style={styles.title}>One quick step</Text>
          <Text style={styles.tagline}>A quick listening check to keep D-Chat free of automated abuse</Text>

          <View style={styles.stepsCard}>
            {STEPS.map((step, i) => (
              <View key={step.title} style={[styles.stepRow, i < STEPS.length - 1 && styles.stepRowDivider]}>
                <View style={styles.stepIconCircle}>
                  <Text style={styles.stepIcon}>{step.icon}</Text>
                </View>
                <View style={styles.stepTextCol}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDesc}>{step.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          <Text style={styles.privacyNote}>
            🔒 No personal information is ever collected — this only measures your response to sound.
          </Text>

          <TouchableOpacity style={styles.readyBtn} onPress={beginPuzzle} activeOpacity={0.85}>
            <Text style={styles.readyBtnText}>I'm ready</Text>
          </TouchableOpacity>
        </View>
      )}

      {stage !== STAGE_INSTRUCTIONS && (
        <View style={styles.mainArea}>
          {stage === STAGE_CONNECTING && (
            <>
              <ActivityIndicator size="large" color="#6C63FF" />
              <Text style={styles.statusText}>{statusText}</Text>
            </>
          )}

          {isListening && (
            <>
              <Text style={styles.tapCountText}>{tapCount}</Text>
              <Text style={styles.tapCountLabel}>high tones heard</Text>

              <TouchableOpacity
                style={styles.tapBtn}
                onPress={handleTap}
                activeOpacity={0.7}
              >
                <Text style={styles.tapBtnText}>Tap for HIGH tone</Text>
              </TouchableOpacity>

              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${chunkTotal > 0 ? Math.min(100, (chunkIndex / chunkTotal) * 100) : 0}%` },
                  ]}
                />
              </View>
            </>
          )}

          {stage === STAGE_CHECKING && (
            <>
              <ActivityIndicator size="large" color="#6C63FF" />
              <Text style={styles.statusText}>Checking…</Text>
            </>
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
              <TouchableOpacity style={styles.retryBtn} onPress={handleReturnToInstructions} activeOpacity={0.85}>
                <Text style={styles.retryBtnText}>Try again</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#0D0D0D', alignItems: 'center', paddingHorizontal: 28 },

  instructionsWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%' },
  headerIcon:    { fontSize: 44, marginBottom: 12 },
  title:         { fontSize: 24, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', marginBottom: 8 },
  tagline:       { fontSize: 13, color: '#6B6B8A', textAlign: 'center', lineHeight: 19, marginBottom: 28, maxWidth: 280 },

  stepsCard:     { width: '100%', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 18, marginBottom: 20 },
  stepRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 },
  stepRowDivider:{ borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  stepIconCircle:{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(108,99,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  stepIcon:      { fontSize: 19 },
  stepTextCol:   { flex: 1 },
  stepTitle:     { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginBottom: 3 },
  stepDesc:      { fontSize: 12.5, color: '#8888A5', lineHeight: 18 },

  privacyNote:   { fontSize: 11.5, color: '#4A4A6A', textAlign: 'center', lineHeight: 17, marginBottom: 28, maxWidth: 280 },

  readyBtn:      { backgroundColor: '#6C63FF', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 56, width: '100%', alignItems: 'center' },
  readyBtnText:  { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },

  mainArea:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, width: '100%' },
  statusText:    { fontSize: 13, color: '#4A4A6A', marginTop: 8 },

  tapCountText:  { fontSize: 64, fontWeight: '800', color: '#6C63FF' },
  tapCountLabel: { fontSize: 13, color: '#6B6B8A', marginTop: -12, marginBottom: 8 },

  tapBtn:        { backgroundColor: '#6C63FF', borderRadius: 100, width: 180, height: 180, alignItems: 'center', justifyContent: 'center', shadowColor: '#6C63FF', shadowOpacity: 0.5, shadowRadius: 24, elevation: 12 },
  tapBtnText:    { color: '#FFFFFF', fontWeight: '700', fontSize: 16, textAlign: 'center', paddingHorizontal: 20 },

  progressTrack: { width: '70%', height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: 12 },
  progressFill:  { height: '100%', backgroundColor: '#6C63FF', borderRadius: 3 },

  successIcon:   { fontSize: 56, color: '#34D399' },
  successText:   { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },

  failIcon:      { fontSize: 56, color: '#F87171' },
  failText:      { fontSize: 15, color: '#FCA5A5', textAlign: 'center', paddingHorizontal: 20 },
  retryBtn:      { marginTop: 8, backgroundColor: '#6C63FF', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40 },
  retryBtnText:  { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});
