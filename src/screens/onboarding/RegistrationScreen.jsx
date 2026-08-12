/**
 * RegistrationScreen.jsx
 *
 * ⚠️ MAJOR FIX — chunk playback rebuilt around a proper queue.
 *
 * Root cause of two related bugs reported on slower devices:
 *   1. "Sometimes stops producing sound, stays silent, puzzle ends"
 *   2. "Puzzle ends, then a second later I hear a high-pitched tone"
 *
 * Both traced to the same problem: the previous version immediately
 * destroyed the previous chunk's audio player the instant a NEW
 * chunk's message arrived. On a fast device, native player creation
 * is quick enough that each chunk mostly gets to play before the next
 * one preempts it. On a slower device, if creating/loading a player
 * takes real time, a chunk could get destroyed BEFORE it ever
 * produced any sound at all — silence, chunk after chunk if the
 * slowness persists — and any chunk still "in flight" when the app's
 * fixed end-of-session timer fired would only start playing audibly
 * AFTER the app had already decided the puzzle was over.
 *
 * Considered fixing this with expo-audio's playbackStatusUpdate /
 * didJustFinish events to detect real completion before advancing —
 * but that has multiple OPEN, ANDROID-SPECIFIC reliability issues in
 * expo-audio itself (completion events firing immediately without
 * actually playing subsequent tracks, or simply not arriving at all
 * after a number of plays, both confirmed on real devices). Relying
 * on that event system would risk trading one silent-audio bug for a
 * different one, on the exact platform this app targets.
 *
 * FIX: a queue paced entirely by setTimeout, using the chunk duration
 * the relay already tells us (chunk_duration_ms), never depending on
 * any playback-completion signal from the audio library at all.
 * Chunks are pushed onto a queue as they arrive rather than
 * immediately played; a single driver processes the queue one at a
 * time, giving each chunk its full, guaranteed duration before
 * advancing — regardless of how quickly messages arrive. On a slow
 * device, playback may simply run behind the relay's real-time
 * schedule and the queue will hold a backlog for a while — but no
 * chunk is ever skipped or cut short. The "submit now" trigger fires
 * only once the queue is genuinely, fully drained after the final
 * chunk — not on a fixed timer that assumes real-time playback kept
 * up with the relay's schedule.
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
  const localQueueDrainedRef = useRef(false);
  const answerWindowOpenRef = useRef(false);
  const chunkDurationRef = useRef(2000);

  const audioQueueRef = useRef([]);
  const isDrainingQueueRef = useRef(false);

  /**
   * Definitively stops any currently-playing audio AND clears any
   * remaining backlog in the queue. Needed because the audio queue is
   * purely local, independent state with no awareness of the overall
   * registration attempt's lifecycle — without this, if registration
   * ends (success, failure, OR the overall connection-level timeout)
   * while chunks are still queued locally (a real possibility on a
   * slow device, by design — the queue deliberately lets playback run
   * behind the relay's real-time schedule rather than skip audio),
   * the queue's own setTimeout-driven loop just keeps running and
   * playing through its backlog regardless — audibly continuing even
   * after a failure screen is already showing.
   */
  function stopAudioQueue() {
    audioQueueRef.current = [];
    isDrainingQueueRef.current = false;
    playerRef.current?.remove?.();
    playerRef.current = null;
  }

  function playChunkAudio(base64Wav) {
    try {
      playerRef.current?.remove?.();
      playerRef.current = createAudioPlayer({ uri: `data:audio/wav;base64,${base64Wav}` });
      playerRef.current.volume = 0.8;
      playerRef.current.play();
    } catch (err) {
      console.warn('[Registration] Failed to play chunk:', err.message);
    }
  }

  function drainQueue() {
    if (audioQueueRef.current.length === 0) {
      isDrainingQueueRef.current = false;
      return;
    }
    isDrainingQueueRef.current = true;

    const { index, base64Wav, isFinal } = audioQueueRef.current.shift();
    playChunkAudio(base64Wav);
    // THE FIX: progress bar now updates HERE, at the moment a chunk
    // actually starts playing — not when its message merely arrived
    // over the network. Those are different moments whenever the
    // local queue has any backlog, and updating on arrival was
    // misleadingly showing the bar at 100% while chunks — possibly
    // including a high tone — were still genuinely unheard. That
    // mismatch is the likely cause of undercounted taps: seeing the
    // bar "finish" is a natural cue to stop paying attention.
    setChunkIndex(index + 1);

    setTimeout(() => {
      const queueNowEmpty = audioQueueRef.current.length === 0;
      if (isFinal && queueNowEmpty) {
        // The local queue has genuinely, fully finished playing —
        // one of the two required conditions. See maybeSubmit().
        localQueueDrainedRef.current = true;
        maybeSubmit();
      }
      drainQueue();
    }, chunkDurationRef.current);
  }

  function enqueueChunk(index, base64Wav, isFinal) {
    audioQueueRef.current.push({ index, base64Wav, isFinal });
    if (!isDrainingQueueRef.current) {
      drainQueue();
    }
  }

  function handleTap() {
    tapCountRef.current += 1;
    setTapCount(tapCountRef.current);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }

  /**
   * The actual gatekeeper: only submits once BOTH the relay says the
   * answer window is open AND the local audio queue has genuinely,
   * fully finished playing. Neither signal alone is trustworthy on
   * its own — the relay's signal arrives in near-real-time over the
   * network regardless of local processing speed, so on a slow
   * device it can arrive well before the user has actually heard
   * (and could tap for) every chunk. Waiting for both closes that
   * gap: a fast device's queue typically finishes before the relay's
   * message even arrives, so this fires immediately as before; a
   * slow device's queue may still be draining when the relay's
   * message arrives, and submission correctly waits for it to
   * genuinely finish rather than firing early with an incomplete count.
   */
  function maybeSubmit() {
    if (localQueueDrainedRef.current && answerWindowOpenRef.current) {
      submitCurrentAnswer();
    }
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
    localQueueDrainedRef.current = false;
    answerWindowOpenRef.current = false;
    stopAudioQueue();

    const reg = startRegistration({
      onStatusChange: (s) => setStatusText(s),

      onSessionStart: (total, chunkDurationMs) => {
        setChunkTotal(total);
        if (chunkDurationMs) chunkDurationRef.current = chunkDurationMs;
        setStage(STAGE_LISTENING);
      },

      onChunk: (chunk) => {
        enqueueChunk(chunk.index, chunk.audioBase64, chunk.isFinal);
      },

      onAnswerWindowOpen: () => {
        answerWindowOpenRef.current = true;
        maybeSubmit();
      },
    });
    regRef.current = reg;

    reg.result.then(async (result) => {
      // THE FIX: stop any still-playing/queued audio the instant
      // registration concludes, whatever the outcome — see
      // stopAudioQueue()'s comment for why this doesn't happen
      // automatically otherwise.
      stopAudioQueue();

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
      stopAudioQueue();
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
                {failReason === 'wrong_count'
                  ? "That wasn't quite right — let's try again."
                  : failReason === 'too_late'
                  ? "That took a bit too long — let's try again."
                  : failReason === 'puzzle_failed' // older relay builds without the split reason
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
