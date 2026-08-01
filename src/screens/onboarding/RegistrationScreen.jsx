/**
 * RegistrationScreen.jsx
 *
 * Replaces the number-pad + 5-second countdown with a simple tap
 * counter: the user taps a button every time they hear a high-pitched
 * tone, in real time, DURING listening — not recalled and typed
 * afterward. The instant the final chunk finishes playing, whatever
 * count they've accumulated is submitted automatically. No keyboard
 * is involved anywhere on this screen anymore, which also means the
 * KeyboardAvoidingView / Android Fragment-isolation issues that
 * affected the previous number-pad version simply don't apply here.
 *
 * Submission timing: the relay sends `chunk_duration_ms` explicitly
 * (see puzzles.js's CHUNK_DURATION_MS) in puzzle_session_start, so the
 * client knows precisely how long the final chunk's audio actually
 * plays for — the count is submitted that many ms after the final
 * chunk is received, matching when a human would actually finish
 * hearing it, not the moment the network message itself arrives.
 *
 * Two submission triggers, whichever fires first (submitCurrentAnswer
 * is idempotent — only the first call actually sends anything):
 *   1. The client's own local timer, fired after the final chunk's
 *      playback duration has elapsed.
 *   2. The relay's puzzle_answer_window signal, as a backup in case
 *      the local timer is somehow delayed or never fires. The relay's
 *      existing ANSWER_WINDOW_MS (5s) still applies server-side as a
 *      generous safety margin for message transit time over Tor —
 *      it's just no longer shown to the user as a countdown.
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
          <Text style={styles.title}>One quick step</Text>
          <Text style={styles.subtitle}>
            Listen closely through the background sound. Every time{'\n'}
            you hear a HIGH-pitched tone, tap the button — right when{'\n'}
            you hear it, not afterward. This helps keep the network{'\n'}
            free of automated abuse, without collecting any personal{'\n'}
            information about you.{'\n\n'}
            It takes about a minute, and submits automatically the{'\n'}
            moment the audio ends.
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
  root:          { flex: 1, backgroundColor: '#0D0D0D', alignItems: 'center', paddingHorizontal: 32 },

  instructionsWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28 },
  title:         { fontSize: 26, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },
  subtitle:      { fontSize: 14, color: '#6B6B8A', textAlign: 'center', lineHeight: 22 },
  readyBtn:      { backgroundColor: '#6C63FF', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 48 },
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
