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
  speak: (id: string, text: string) => Promise<void>;
  stop: () => void;
  ensureHealth: () => Promise<void>;
  markAutoSpoken: (id: string) => void;
}

// Playback handles are not render state -- keeping them out of the store avoids
// re-rendering every subscriber when an audio element is swapped.
let audio: HTMLAudioElement | null = null;
let objectUrl: string | null = null;
let controller: AbortController | null = null;
let token = 0;
let healthProbe: Promise<void> | null = null;

function speakBrowserFemaleVoice(
  text: string,
  onEnd: () => void,
  onError: (err: unknown) => void,
): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    const utterance = new SpeechSynthesisUtterance(text);
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
    utterance.onend = onEnd;
    utterance.onerror = (e) => {
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
  if (audio) {
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.src = '';
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
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore
    }
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

  speak: async (id: string, text: string) => {
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
    const configuredVoice = useAppStore.getState?.()?.settings?.voiceId;
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

      const url = URL.createObjectURL(blob);
      objectUrl = url;
      const el = new Audio(url);
      audio = el;

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
      } catch (playErr) {
        // Autoplay policy or audio decode fallback to browser speech synthesis
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
    const silent = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
    silent.play().catch(() => {});
    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
    }
  } catch {}
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
