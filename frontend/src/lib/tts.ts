import { create } from 'zustand';
import { synthesizeSpeech, fetchTtsHealth } from './api';
import { toSpeakableText } from './message-text';
import { useAppStore } from './store';

export type TtsState = 'idle' | 'loading' | 'speaking';

/**
 * Voice output is a single shared resource: one utterance at a time, for the
 * whole app. The state lives in one store rather than per component, because a
 * per-component hook would give every message its own audio element -- two
 * replies would then talk over each other, and autoplay would make that the
 * normal case rather than the exception.
 */
interface TtsStore {
  state: TtsState;
  /** id of the message currently loading or speaking, if any. */
  speakingId: string | null;
  error: string | null;
  /** Message whose read-aloud attempt failed, if any. */
  errorId: string | null;
  /** null until the health probe has answered. */
  available: boolean | null;
  /** Last message spoken by autoplay, so a re-render never repeats it. */
  autoSpokenId: string | null;
  speak: (id: string, text: string, options?: { voiceId?: string }) => Promise<void>;
  stop: () => void;
  ensureHealth: () => Promise<void>;
  markAutoSpoken: (id: string) => void;
}

// Playback handles are not render state -- keeping them out of the store avoids
// re-rendering every subscriber when an audio element is swapped.
let audio: HTMLAudioElement | null = null;
let sharedAudioElement: HTMLAudioElement | null = null;
let objectUrl: string | null = null;
let controller: AbortController | null = null;
let activeSourceNode: AudioBufferSourceNode | null = null;
let sharedAudioCtx: AudioContext | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let token = 0;
let healthProbe: Promise<void> | null = null;

export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioContextClass();
  }
  return sharedAudioCtx;
}

export function getSharedAudioElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioElement) {
    try {
      sharedAudioElement = new Audio();
      sharedAudioElement.preload = 'auto';
      sharedAudioElement.volume = 1.0;
    } catch {}
  }
  return sharedAudioElement;
}

function decodeAudioDataSafe(ctx: AudioContext, buffer: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    try {
      const promise = ctx.decodeAudioData(
        buffer.slice(0),
        (decoded) => {
          if (decoded) resolve(decoded);
          else reject(new Error('Audio decoding returned empty buffer'));
        },
        (err) => reject(err),
      );
      if (promise && typeof promise.then === 'function') {
        promise.then(resolve).catch(reject);
      }
    } catch (err) {
      reject(err);
    }
  });
}

function speakBrowserFemaleVoice(
  text: string,
  onEnd: () => void,
  onError: (err: unknown) => void,
): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  try {
    window.speechSynthesis.cancel();
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    activeUtterance = utterance;
    const voices = window.speechSynthesis.getVoices();
    const isHindi = /[\u0900-\u097F]/.test(text);

    // Prioritize Hindi voices if Hindi text, else Irish / English female voices
    const hindiVoice = isHindi
      ? voices.find((v) => /hi[-_]in|hindi/i.test(v.lang) || /swara|madhur|kalpana/i.test(v.name))
      : null;

    const femaleVoice =
      hindiVoice ||
      voices.find((v) => /emily|ireland|irish/i.test(v.name) || /en[-_]ie/i.test(v.lang)) ||
      voices.find((v) => /zira|aria|jenny|samantha|victoria|susan|karen|female/i.test(v.name)) ||
      voices.find((v) => v.lang.startsWith('en') && /female/i.test(v.name)) ||
      voices.find((v) => v.lang.startsWith('en')) ||
      voices[0];

    if (femaleVoice) {
      utterance.voice = femaleVoice;
      utterance.lang = femaleVoice.lang;
    }
    utterance.pitch = 1.05;
    utterance.rate = 1.0;
    utterance.onend = () => {
      activeUtterance = null;
      onEnd();
    };
    utterance.onerror = (e) => {
      activeUtterance = null;
      if (e.error === 'canceled' || e.error === 'interrupted') return;
      onError(e);
    };
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

/** Only a stream ending in the active conversation may trigger autoplay. */
export function shouldAutoplayFinishedReply(
  previousStreamingConversationId: string | null,
  activeId: string | null,
  streamIsActive: boolean,
  lastMessage: { id: string; role: string } | undefined,
  autoSpokenId: string | null,
): boolean {
  return previousStreamingConversationId !== null
    && previousStreamingConversationId === activeId
    && !streamIsActive
    && lastMessage !== undefined
    && lastMessage.role === 'assistant'
    && lastMessage.id !== autoSpokenId;
}

function teardown(): void {
  if (activeSourceNode) {
    try {
      activeSourceNode.onended = null;
      activeSourceNode.stop();
      activeSourceNode.disconnect();
    } catch {}
    activeSourceNode = null;
  }
  if (sharedAudioElement) {
    try {
      sharedAudioElement.onended = null;
      sharedAudioElement.onerror = null;
      sharedAudioElement.pause();
      sharedAudioElement.src = '';
    } catch {}
  }
  if (audio) {
    try {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.src = '';
    } catch {}
    audio = null;
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  if (controller) {
    controller.abort();
    controller = null;
  }
  if (activeUtterance) {
    activeUtterance.onend = null;
    activeUtterance.onerror = null;
    activeUtterance = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
}

export const useTtsStore = create<TtsStore>((set, get) => ({
  state: 'idle',
  speakingId: null,
  error: null,
  errorId: null,
  available: null,
  autoSpokenId: null,

  ensureHealth: () => {
    if (healthProbe) return healthProbe;
    healthProbe = fetchTtsHealth()
      .then((health) => {
        const hasBrowserSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;
        set({ available: health.available || hasBrowserSpeech });
        if (!health.available && !hasBrowserSpeech) healthProbe = null;
      })
      .catch(() => {
        const hasBrowserSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;
        set({ available: hasBrowserSpeech });
        if (!hasBrowserSpeech) healthProbe = null;
      });
    return healthProbe;
  },

  markAutoSpoken: (id: string) => set({ autoSpokenId: id }),

  speak: async (id: string, text: string, options?: { voiceId?: string }) => {
    const trimmed = toSpeakableText(text);
    if (!trimmed) return;

    // Bump before teardown so a synthesis still in flight is both aborted and
    // fenced off by the token, even if the abort loses the race.
    token += 1;
    const mine = token;
    teardown();
    set({ state: 'loading', speakingId: id, error: null, errorId: null });

    const ac = new AbortController();
    controller = ac;

    const isHindi = /[\u0900-\u097F]/.test(trimmed);
    const configuredVoice = options?.voiceId || useAppStore.getState?.()?.settings?.voiceId;
    const voiceId = isHindi
      ? (configuredVoice && configuredVoice.toLowerCase().startsWith('hi-') ? configuredVoice : 'hi-IN-SwaraNeural')
      : (configuredVoice || 'en-IE-EmilyNeural');

    try {
      let blob: Blob;
      try {
        blob = await synthesizeSpeech(trimmed, { signal: ac.signal, voiceId });
      } catch (backendErr) {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          const spoken = speakBrowserFemaleVoice(
            trimmed,
            () => {
              if (mine !== token) return;
              teardown();
              set({ state: 'idle', speakingId: null });
            },
            () => {
              if (mine !== token) return;
              teardown();
              set({
                state: 'idle',
                speakingId: null,
                error: backendErr instanceof Error ? backendErr.message : 'Speech synthesis failed',
                errorId: id,
              });
            },
          );
          if (spoken) {
            if (mine === token) set({ state: 'speaking', speakingId: id });
            return;
          }
        }
        throw backendErr;
      }

      if (mine !== token) return;

      // Strategy 1: Shared AudioContext playback with volume gain node
      const ctx = getSharedAudioContext();
      if (ctx) {
        try {
          if (ctx.state === 'suspended') {
            await ctx.resume().catch(() => {});
          }
          const arrayBuf = await blob.arrayBuffer();
          const decodedBuffer = await decodeAudioDataSafe(ctx, arrayBuf);
          if (mine !== token) return;

          const source = ctx.createBufferSource();
          source.buffer = decodedBuffer;
          const gainNode = ctx.createGain();
          gainNode.gain.setValueAtTime(1.0, ctx.currentTime);
          source.connect(gainNode);
          gainNode.connect(ctx.destination);
          activeSourceNode = source;

          source.onended = () => {
            if (mine !== token) return;
            teardown();
            set({ state: 'idle', speakingId: null });
          };

          source.start(0);
          if (mine === token) set({ state: 'speaking', speakingId: id });
          return;
        } catch (ctxErr) {
          console.warn('[Friday Voice] AudioContext strategy error:', ctxErr);
        }
      }

      // Strategy 2: Pre-blessed persistent HTMLAudioElement playback
      const url = URL.createObjectURL(blob);
      objectUrl = url;
      const el = getSharedAudioElement() || new Audio();
      audio = el;
      el.src = url;
      el.volume = 1.0;
      el.muted = false;
      el.currentTime = 0;

      el.onended = () => {
        if (mine !== token) return;
        teardown();
        set({ state: 'idle', speakingId: null });
      };
      el.onerror = () => {
        if (mine !== token) return;
        teardown();
        set({ state: 'idle', speakingId: null, error: 'Playback failed', errorId: id });
      };

      try {
        await el.play();
        if (mine === token) set({ state: 'speaking', speakingId: id });
        return;
      } catch (playErr) {
        console.warn('[Friday Voice] HTMLAudioElement strategy error:', playErr);
        // Strategy 3: Fallback to browser speech synthesis
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          const spoken = speakBrowserFemaleVoice(
            trimmed,
            () => {
              if (mine !== token) return;
              teardown();
              set({ state: 'idle', speakingId: null });
            },
            () => {
              if (mine !== token) return;
              teardown();
              set({ state: 'idle', speakingId: null });
            },
          );
          if (spoken) {
            if (mine === token) set({ state: 'speaking', speakingId: id });
            return;
          }
        }
        throw playErr;
      }
    } catch (err) {
      if (mine !== token) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      teardown();
      set({
        state: 'idle',
        speakingId: null,
        error: err instanceof Error ? err.message : 'Speech synthesis failed',
        errorId: id,
      });
    }
  },

  stop: () => {
    token += 1;
    teardown();
    set({ state: 'idle', speakingId: null, error: null, errorId: null });
  },
}));

/** Pre-warm / unlock browser audio on user gesture so subsequent async speech playback is never blocked */
export function unlockAudio(): void {
  if (typeof window === 'undefined') return;
  try {
    const ctx = getSharedAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
      try {
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      } catch {}
    }
    const el = getSharedAudioElement();
    if (el) {
      el.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      el.play().catch(() => {});
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
    }
  } catch {}
}

// Auto-register interaction listeners so ANY user interaction automatically unlocks audio
if (typeof window !== 'undefined') {
  const onUserInteraction = () => {
    unlockAudio();
  };
  window.addEventListener('click', onUserInteraction, { capture: true, passive: true });
  window.addEventListener('pointerdown', onUserInteraction, { capture: true, passive: true });
  window.addEventListener('keydown', onUserInteraction, { capture: true, passive: true });
  window.addEventListener('touchstart', onUserInteraction, { capture: true, passive: true });
}

/** Test seam: reset module-level playback handles between cases. */
export function __resetTtsForTests(): void {
  teardown();
  token = 0;
  healthProbe = null;
  useTtsStore.setState({
    state: 'idle',
    speakingId: null,
    error: null,
    errorId: null,
    available: null,
    autoSpokenId: null,
  });
}
