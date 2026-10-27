import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  X,
  Sparkles,
  Globe,
  Square,
  MessageSquare,
  RotateCcw,
  AlertCircle,
  Play,
  Send,
} from 'lucide-react';
import { useAppStore, generateId } from '../../lib/store';
import { useTtsStore, unlockAudio } from '../../lib/tts';
import { streamChat } from '../../lib/sse';
import { transcribeAudio } from '../../lib/api';

// Web Speech API types
interface IWindowSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

type VoiceStatus = 'idle' | 'listening' | 'thinking' | 'speaking' | 'muted';

export function FridayVoiceModal() {
  const isOpen = useAppStore((s) => s.voiceModalOpen);
  const setIsOpen = useAppStore((s) => s.setVoiceModalOpen);
  const activeId = useAppStore((s) => s.activeId);
  const createConversation = useAppStore((s) => s.createConversation);
  const addMessage = useAppStore((s) => s.addMessage);
  const updateLastAssistant = useAppStore((s) => s.updateLastAssistant);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const defaultModel = useAppStore((s) => s.settings.defaultModel);
  const userName = useAppStore((s) => s.settings.userName) || 'Sahil Yadav';
  const firstName = userName.split(' ')[0] || 'Sahil';

  // TTS store
  const ttsState = useTtsStore((s) => s.state);
  const speakTts = useTtsStore((s) => s.speak);
  const stopTts = useTtsStore((s) => s.stop);

  // Local Voice State
  const [status, setStatus] = useState<VoiceStatus>('listening');
  const [language, setLanguage] = useState<'hi-IN' | 'en-US' | 'auto'>('hi-IN');
  const [userTranscript, setUserTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [assistantReply, setAssistantReply] = useState('');
  const [textInput, setTextInput] = useState('');
  const [soundBars, setSoundBars] = useState<number[]>(new Array(24).fill(15));
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);

  // Status and Mute reference to avoid stale closure issues
  const isMutedRef = useRef(false);
  const statusRef = useRef<VoiceStatus>('listening');
  statusRef.current = status;

  const recognitionRef = useRef<IWindowSpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const isSpeakingRef = useRef(false);
  const abortChatRef = useRef<AbortController | null>(null);

  // MediaRecorder backup refs
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isProcessingUtteranceRef = useRef(false);

  // Sync TTS state with voice status
  useEffect(() => {
    isSpeakingRef.current = ttsState === 'speaking' || ttsState === 'loading';
    if (ttsState === 'speaking' || ttsState === 'loading') {
      setStatus('speaking');
    } else if (statusRef.current === 'speaking' && ttsState === 'idle') {
      // Speech finished! If not muted, resume listening
      if (!isMutedRef.current && isOpen) {
        setStatus('listening');
        startListening();
      } else {
        setStatus('muted');
      }
    }
  }, [ttsState, isOpen]);

  // Stop Web Audio & Recorder cleanly
  const stopAudioAnalyser = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
      mediaRecorderRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  };

  // Setup Web Audio analyser & MediaRecorder
  const initAudioStream = async (): Promise<boolean> => {
    setMicPermissionError(null);
    unlockAudio();

    if (!navigator.mediaDevices?.getUserMedia) {
      setMicPermissionError('Microphone is not supported in this browser.');
      return false;
    }

    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // Audio Context for volume visualizer
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        analyserRef.current = analyser;
      }

      // Start MediaRecorder backup
      try {
        const recorder = new MediaRecorder(stream);
        audioChunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        recorder.start(500);
        mediaRecorderRef.current = recorder;
      } catch {}

      return true;
    } catch (err: any) {
      const msg = err.name === 'NotAllowedError'
        ? 'Microphone access was denied. Please click the lock or camera icon in the browser URL bar and allow microphone access.'
        : `Microphone error: ${err.message || 'Unable to access microphone'}`;
      setMicPermissionError(msg);
      return false;
    }
  };

  const latestTranscriptRef = useRef('');
  const restartTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Stop Speech Recognition cleanly
  const stopListening = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }
  }, []);

  // Start Speech Recognition
  const startListening = useCallback(async () => {
    if (isMutedRef.current || isSpeakingRef.current || isProcessingUtteranceRef.current) {
      return;
    }
    unlockAudio();

    // Ensure physical audio stream is live
    if (!mediaStreamRef.current) {
      const ok = await initAudioStream();
      if (!ok) return;
    }

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRec) {
      try {
        stopListening();

        const rec: IWindowSpeechRecognition = new SpeechRec();
        rec.continuous = false;
        rec.interimResults = true;
        rec.lang = language === 'auto' ? 'hi-IN' : language;

        rec.onstart = () => {
          if (isMutedRef.current) {
            try {
              rec.onstart = null;
              rec.onresult = null;
              rec.onerror = null;
              rec.onend = null;
              rec.abort();
            } catch {}
            return;
          }
          statusRef.current = 'listening';
          setStatus('listening');
          setInterimTranscript('');
          latestTranscriptRef.current = '';
        };

        rec.onresult = (e: any) => {
          if (isMutedRef.current || isProcessingUtteranceRef.current) return;

          let finalStr = '';
          let interimStr = '';

          for (let i = e.resultIndex; i < e.results.length; i++) {
            const item = e.results[i];
            if (item.isFinal) {
              finalStr += item[0].transcript;
            } else {
              interimStr += item[0].transcript;
            }
          }

          const currentBest = (finalStr || interimStr).trim();
          if (currentBest) {
            latestTranscriptRef.current = currentBest;
          }

          if (interimStr) {
            setInterimTranscript(interimStr);
          }

          if (finalStr.trim()) {
            const textToSend = finalStr.trim();
            latestTranscriptRef.current = '';
            setUserTranscript(textToSend);
            setInterimTranscript('');
            handleUserUtterance(textToSend);
          } else if (interimStr.trim()) {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = setTimeout(() => {
              if (
                latestTranscriptRef.current &&
                !isMutedRef.current &&
                !isProcessingUtteranceRef.current
              ) {
                const textToSend = latestTranscriptRef.current;
                latestTranscriptRef.current = '';
                setUserTranscript(textToSend);
                setInterimTranscript('');
                handleUserUtterance(textToSend);
              }
            }, 1200);
          }
        };

        rec.onerror = (e: any) => {
          if (isMutedRef.current) return;
          if (e.error === 'not-allowed') {
            setMicPermissionError('Microphone blocked by browser. Please grant permission in address bar.');
          } else if (e.error === 'no-speech' || e.error === 'network') {
            if (
              !isMutedRef.current &&
              statusRef.current === 'listening' &&
              !isSpeakingRef.current &&
              !isProcessingUtteranceRef.current
            ) {
              if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
              restartTimerRef.current = setTimeout(() => {
                if (!isMutedRef.current && isOpen && statusRef.current === 'listening') {
                  startListening();
                }
              }, 400);
            }
          }
        };

        rec.onend = () => {
          // If speech was captured but not finalized before end, commit it now!
          if (
            latestTranscriptRef.current &&
            !isMutedRef.current &&
            !isProcessingUtteranceRef.current
          ) {
            const textToSend = latestTranscriptRef.current;
            latestTranscriptRef.current = '';
            setUserTranscript(textToSend);
            setInterimTranscript('');
            handleUserUtterance(textToSend);
            return;
          }

          // Otherwise auto-restart if still active and not muted
          if (
            !isMutedRef.current &&
            !isSpeakingRef.current &&
            isOpen &&
            !isProcessingUtteranceRef.current &&
            statusRef.current === 'listening'
          ) {
            if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
            restartTimerRef.current = setTimeout(() => {
              if (
                !isMutedRef.current &&
                isOpen &&
                statusRef.current === 'listening' &&
                !isProcessingUtteranceRef.current
              ) {
                try {
                  rec.start();
                } catch {
                  startListening();
                }
              }
            }, 300);
          }
        };

        rec.start();
        recognitionRef.current = rec;
      } catch {
        // SpeechRecognition start error fallback
      }
    }

    if (!isMutedRef.current) {
      statusRef.current = 'listening';
      setStatus('listening');
    }
  }, [language, isOpen]);

  // Transcribe buffered audio via Whisper
  const transcribeRecordedAudio = async (): Promise<string> => {
    if (!audioChunksRef.current.length) return '';
    try {
      const mime = mediaRecorderRef.current?.mimeType || 'audio/webm';
      const blob = new Blob(audioChunksRef.current, { type: mime });
      audioChunksRef.current = [];
      const res = await transcribeAudio(blob);
      return res.text?.trim() || '';
    } catch {
      return '';
    }
  };

  // Equalizer Visualizer Loop
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    const updateBars = () => {
      if (!mounted) return;

      if (isMutedRef.current || status === 'muted') {
        // Flat bars when muted
        setSoundBars(new Array(24).fill(6));
      } else if (analyserRef.current && status === 'listening') {
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const step = Math.floor(data.length / 24);
        const bars = Array.from({ length: 24 }, (_, i) => {
          const val = data[i * step] || 0;
          return Math.max(10, Math.min(100, (val / 255) * 100));
        });
        setSoundBars(bars);
      } else if (status === 'speaking') {
        const time = Date.now() / 150;
        const bars = Array.from({ length: 24 }, (_, i) => {
          const wave = Math.sin(time + i * 0.4) * 0.5 + 0.5;
          const wave2 = Math.cos(time * 0.8 + i * 0.2) * 0.5 + 0.5;
          return Math.max(20, Math.floor((wave * 0.6 + wave2 * 0.4) * 85 + 15));
        });
        setSoundBars(bars);
      } else if (status === 'thinking') {
        const time = Date.now() / 200;
        const bars = Array.from({ length: 24 }, (_, i) => {
          const dist = Math.abs(i - 11.5) / 11.5;
          return Math.max(15, Math.floor(Math.sin(time - dist * 2) * 35 + 40));
        });
        setSoundBars(bars);
      } else {
        const time = Date.now() / 400;
        const bars = Array.from({ length: 24 }, (_, i) => {
          return Math.max(8, Math.floor(Math.sin(time + i * 0.3) * 15 + 20));
        });
        setSoundBars(bars);
      }

      animFrameRef.current = requestAnimationFrame(updateBars);
    };

    animFrameRef.current = requestAnimationFrame(updateBars);

    return () => {
      mounted = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isOpen, status]);

  // Handle User Utterance -> Query Assistant -> Speak Response
  const handleUserUtterance = async (userText: string) => {
    let finalQuery = userText.trim();

    if (!finalQuery) {
      finalQuery = await transcribeRecordedAudio();
    }

    if (!finalQuery) return;

    isProcessingUtteranceRef.current = true;
    stopListening();
    setStatus('thinking');
    setUserTranscript(finalQuery);
    setHistoryItems((prev) => [...prev, { role: 'user', text: finalQuery }]);

    // Resolve target model and active conversation
    const targetModel = selectedModel || defaultModel || 'gemini-2.5-flash';
    let convId = activeId;
    if (!convId) {
      convId = createConversation(targetModel);
    }

    const userMessageId = generateId();
    addMessage(convId, {
      id: userMessageId,
      role: 'user',
      content: finalQuery,
      timestamp: Date.now(),
    });

    const assistantMessageId = generateId();
    addMessage(convId, {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    });

    const abortCtrl = new AbortController();
    abortChatRef.current = abortCtrl;

    try {
      const systemPrompt = `You are F.R.I.D.A.Y., the advanced and charismatic AI assistant created for ${userName} (${firstName}). 
Tone: Highly intelligent, concise, warm, helpful, and natural for voice conversation.
Crucial Voice Rules:
1. Keep spoken answers short and direct (1-3 sentences maximum).
2. Never output markdown tables, raw URLs, code blocks, or asterisks/bullet symbols, as they sound awkward when read aloud.
3. If ${firstName} speaks in Hindi, respond in fluent, respectful, natural Hindi. If English, respond in English.
4. Address the user politely as "${firstName}" or "sir".`;

      const messagesPayload = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: finalQuery },
      ];

      let accumulated = '';
      const generator = streamChat(
        {
          model: targetModel,
          messages: messagesPayload,
          stream: true,
          temperature: 0.7,
        },
        abortCtrl.signal,
      );

      for await (const event of generator) {
        if (event.data) {
          try {
            const parsed = JSON.parse(event.data);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              accumulated += delta;
              setAssistantReply(accumulated);
            }
          } catch {}
        }
      }

      const finalReply = accumulated.trim() || `Yes, ${firstName}. All neural systems are online.`;
      setAssistantReply(finalReply);
      updateLastAssistant(convId, finalReply);
      setHistoryItems((prev) => [...prev, { role: 'assistant', text: finalReply }]);

      // Speak back the response!
      statusRef.current = 'speaking';
      setStatus('speaking');
      isProcessingUtteranceRef.current = false;
      await speakTts(assistantMessageId, finalReply);
    } catch (err: any) {
      isProcessingUtteranceRef.current = false;
      if (err.name === 'AbortError') return;
      const fallback = `I am online, ${firstName}. How may I help you?`;
      setAssistantReply(fallback);
      statusRef.current = 'speaking';
      setStatus('speaking');
      await speakTts(assistantMessageId, fallback);
    }
  };

  // Toggle Mute (Strict, Reliable, Hardware-off)
  const toggleMute = () => {
    unlockAudio();
    if (isMutedRef.current || status === 'muted') {
      // Unmute
      isMutedRef.current = false;
      statusRef.current = 'listening';
      setStatus('listening');
      initAudioStream().then((ok) => {
        if (ok && !isMutedRef.current) {
          startListening();
        }
      });
    } else {
      // Mute
      isMutedRef.current = true;
      statusRef.current = 'muted';
      setStatus('muted');
      stopListening();
      stopTts();
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {}
        });
        mediaStreamRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
        mediaRecorderRef.current = null;
      }
      latestTranscriptRef.current = '';
      setInterimTranscript('');
      setSoundBars(new Array(24).fill(4));
    }
  };

  // Manual Trigger: User taps "Finish Speaking & Send"
  const handleManualSend = async () => {
    unlockAudio();
    if (interimTranscript.trim()) {
      handleUserUtterance(interimTranscript.trim());
      setInterimTranscript('');
    } else if (textInput.trim()) {
      handleUserUtterance(textInput.trim());
      setTextInput('');
    } else {
      stopListening();
      setStatus('thinking');
      const text = await transcribeRecordedAudio();
      if (text) {
        handleUserUtterance(text);
      } else {
        if (!isMutedRef.current) {
          setStatus('listening');
          startListening();
        } else {
          setStatus('muted');
        }
      }
    }
  };

  // Test Friday's Voice Output
  const handleTestVoice = async () => {
    unlockAudio();
    stopListening();
    const testId = generateId();
    const voiceId = language === 'hi-IN' ? 'hi-IN-SwaraNeural' : 'en-IE-EmilyNeural';
    const greeting = language === 'hi-IN'
      ? `नमस्ते ${firstName}, एफ.आर.आई.डी.ए.वाई. की आवाज़ सक्रिय है। आप क्या पूछना चाहते हैं?`
      : `Audio channels calibrated, ${firstName}. All neural systems online.`;
    setAssistantReply(greeting);
    statusRef.current = 'speaking';
    setStatus('speaking');
    await speakTts(testId, greeting, { voiceId });
  };

  // Interrupt / Stop
  const handleInterrupt = () => {
    unlockAudio();
    stopTts();
    if (abortChatRef.current) {
      abortChatRef.current.abort();
      abortChatRef.current = null;
    }
    if (!isMutedRef.current) {
      setStatus('listening');
      setInterimTranscript('');
      startListening();
    } else {
      setStatus('muted');
    }
  };

  // Replay Last Spoken Message
  const handleReplay = async () => {
    if (!assistantReply) return;
    unlockAudio();
    const replayId = generateId();
    setStatus('speaking');
    await speakTts(replayId, assistantReply);
  };

  // When modal opens/closes
  useEffect(() => {
    if (isOpen) {
      isMutedRef.current = false;
      isProcessingUtteranceRef.current = false;
      unlockAudio();
      useTtsStore.getState().ensureHealth();

      initAudioStream().then((ok) => {
        if (ok && !isMutedRef.current) {
          startListening();
        }
      });

      if (historyItems.length === 0) {
        const welcome = `F.R.I.D.A.Y. neural systems online. How may I assist you, ${firstName}?`;
        setAssistantReply(welcome);
      }
    } else {
      isMutedRef.current = true;
      stopListening();
      stopTts();
      stopAudioAnalyser();
      if (abortChatRef.current) abortChatRef.current.abort();
    }

    return () => {
      isMutedRef.current = true;
      stopListening();
      stopTts();
      stopAudioAnalyser();
      if (abortChatRef.current) abortChatRef.current.abort();
    };
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, setIsOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4 select-none">
      {/* Sci-Fi Backdrop with deep blur and dark HUD vignette */}
      <div
        className="absolute inset-0 bg-[#07090E]/90 backdrop-blur-2xl transition-opacity animate-in fade-in duration-300"
        onClick={() => setIsOpen(false)}
      />

      {/* Ambient glowing radial light behind Arc Reactor */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-orange-600/20 via-amber-500/25 to-cyan-500/15 rounded-full blur-3xl pointer-events-none animate-pulse" />

      {/* Main HUD Window */}
      <div
        className="relative w-full max-w-2xl bg-[#0D0F17]/95 border border-orange-500/40 rounded-3xl shadow-2xl shadow-orange-500/20 overflow-hidden flex flex-col items-center p-5 md:p-7 animate-in zoom-in-95 duration-300"
        style={{
          boxShadow: '0 0 50px rgba(249, 115, 22, 0.25), inset 0 0 30px rgba(249, 115, 22, 0.05)',
        }}
      >
        {/* Top Header Bar */}
        <div className="w-full flex items-center justify-between pb-3.5 border-b border-white/10 mb-3">
          <div className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full ${status === 'muted' ? 'bg-red-400' : 'bg-emerald-400 animate-ping'}`} />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold tracking-widest text-orange-400 font-mono">
                  F.R.I.D.A.Y.
                </span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30">
                  Voice Core v2.5
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 font-mono">
                Assisting {userName} • {selectedModel || defaultModel || 'gemini-2.5-flash'}
              </p>
            </div>
          </div>

          {/* Quick Actions Header */}
          <div className="flex items-center gap-2">
            {/* Test Voice Button */}
            <button
              onClick={handleTestVoice}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/40 text-xs text-orange-300 transition-colors cursor-pointer"
              title="Test F.R.I.D.A.Y. Voice Output"
            >
              <Play size={13} className="fill-current" />
              <span className="font-mono text-[11px] font-semibold">Test Voice</span>
            </button>

            {/* Language Selector */}
            <button
              onClick={() => {
                const next = language === 'hi-IN' ? 'en-US' : language === 'en-US' ? 'auto' : 'hi-IN';
                setLanguage(next);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-zinc-300 transition-colors cursor-pointer"
              title="Change Voice Language"
            >
              <Globe size={14} className="text-orange-400" />
              <span className="font-mono uppercase text-[11px]">
                {language === 'hi-IN' ? 'हिन्दी (HI)' : language === 'en-US' ? 'English (EN)' : 'Auto'}
              </span>
            </button>

            {/* Conversation History Toggle */}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                showHistory
                  ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                  : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
              }`}
              title="Toggle Transcript History"
            >
              <MessageSquare size={16} />
            </button>

            {/* Close Button */}
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title="Close Voice Assistant (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Microphone Warning Banner if browser blocked mic */}
        {micPermissionError && (
          <div className="w-full mb-3 px-3.5 py-2 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle size={16} className="text-red-400 shrink-0" />
            <span className="leading-tight">{micPermissionError}</span>
          </div>
        )}

        {/* Center: The Glowing Arc Reactor Core */}
        <div className="relative my-2.5 flex items-center justify-center">
          {/* Outer rotating dashed HUD ring */}
          <div
            className={`absolute w-48 h-48 md:w-56 md:h-56 rounded-full border-2 border-dashed border-orange-500/40 pointer-events-none ${
              status === 'thinking'
                ? 'animate-spin'
                : status === 'speaking'
                ? 'animate-pulse'
                : status === 'muted'
                ? 'opacity-30'
                : 'animate-[spin_20s_linear_infinite]'
            }`}
          />

          {/* Secondary counter-rotating ring with tick marks */}
          <div
            className={`absolute w-40 h-40 md:w-48 md:h-48 rounded-full border border-cyan-500/30 pointer-events-none ${
              status === 'muted' ? 'opacity-20' : 'animate-[spin_15s_linear_infinite_reverse]'
            }`}
            style={{
              borderTopColor: status === 'muted' ? 'gray' : 'rgba(6, 182, 212, 0.8)',
              borderRightColor: 'transparent',
            }}
          />

          {/* Expanding radar shockwaves when listening or speaking */}
          {(status === 'listening' || status === 'speaking') && (
            <>
              <div className="absolute w-36 h-36 rounded-full border border-orange-500/60 animate-ping opacity-30 pointer-events-none" />
              <div className="absolute w-44 h-44 rounded-full border border-amber-400/40 animate-ping opacity-20 pointer-events-none" />
            </>
          )}

          {/* Central Reactor Button */}
          <button
            onClick={status === 'speaking' ? handleInterrupt : toggleMute}
            className={`relative z-10 w-32 h-32 md:w-36 md:h-36 rounded-full overflow-hidden p-1 transition-all duration-300 active:scale-95 group focus:outline-none cursor-pointer ${
              status === 'muted' ? 'opacity-70 grayscale-50 ring-2 ring-zinc-700' : ''
            }`}
            style={{
              boxShadow:
                status === 'speaking'
                  ? '0 0 60px rgba(249, 115, 22, 0.8), 0 0 100px rgba(234, 88, 12, 0.5)'
                  : status === 'listening'
                  ? '0 0 45px rgba(249, 115, 22, 0.6), 0 0 80px rgba(6, 182, 212, 0.3)'
                  : status === 'muted'
                  ? '0 0 15px rgba(100, 100, 100, 0.2)'
                  : '0 0 30px rgba(249, 115, 22, 0.3)',
            }}
            title={status === 'speaking' ? 'Click to Interrupt' : status === 'muted' ? 'Click to Unmute' : 'Click to Mute'}
          >
            <img
              src="/friday-core.jpg"
              alt="F.R.I.D.A.Y. Arc Reactor Core"
              className={`w-full h-full rounded-full object-cover transition-transform duration-700 ${
                status === 'thinking'
                  ? 'scale-110 rotate-180 duration-1000'
                  : status === 'speaking'
                  ? 'scale-105 duration-300'
                  : status === 'muted'
                  ? 'scale-95'
                  : 'group-hover:scale-105'
              }`}
            />

            {/* Glowing inner overlay */}
            <div
              className={`absolute inset-0 rounded-full transition-opacity duration-300 ${
                status === 'speaking'
                  ? 'bg-orange-500/20'
                  : status === 'thinking'
                  ? 'bg-cyan-500/25'
                  : status === 'muted'
                  ? 'bg-black/70 flex items-center justify-center'
                  : 'bg-orange-500/10 group-hover:bg-orange-500/20'
              }`}
            >
              {status === 'muted' && (
                <div className="px-2.5 py-1 rounded-full bg-red-500/80 text-white font-mono text-[10px] font-bold uppercase shadow-lg">
                  MUTED
                </div>
              )}
            </div>
          </button>
        </div>

        {/* Equalizer Frequency Waveform Bars */}
        <div className="flex items-center justify-center gap-1.5 h-8 my-1.5 w-full max-w-md">
          {soundBars.map((height, idx) => (
            <div
              key={idx}
              className={`w-1.5 rounded-full transition-all duration-100 ${
                status === 'muted'
                  ? 'bg-zinc-800'
                  : status === 'speaking'
                  ? 'bg-gradient-to-t from-orange-600 via-amber-400 to-cyan-300 shadow-sm shadow-orange-500/50'
                  : status === 'listening'
                  ? 'bg-gradient-to-t from-orange-500 to-amber-300 shadow-sm shadow-amber-400/50'
                  : status === 'thinking'
                  ? 'bg-cyan-400 shadow-sm shadow-cyan-400/50'
                  : 'bg-zinc-700/50'
              }`}
              style={{
                height: `${height}%`,
              }}
            />
          ))}
        </div>

        {/* Dynamic Status Pill */}
        <div className="my-1">
          {status === 'listening' && (
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-orange-500/20 border border-orange-500/50 text-orange-300 text-xs font-mono font-medium tracking-wide animate-pulse shadow-md shadow-orange-500/20">
              <span className="w-2 h-2 rounded-full bg-orange-400 animate-ping" />
              <span>LISTENING TO {firstName.toUpperCase()}...</span>
            </div>
          )}
          {status === 'thinking' && (
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 text-xs font-mono font-medium tracking-wide animate-pulse shadow-md shadow-cyan-500/20">
              <Sparkles size={14} className="animate-spin" />
              <span>NEURAL CORE PROCESSING...</span>
            </div>
          )}
          {status === 'speaking' && (
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-300 text-xs font-mono font-medium tracking-wide shadow-md shadow-amber-500/20">
              <Volume2 size={14} className="animate-bounce" />
              <span>F.R.I.D.A.Y. SPEAKING...</span>
            </div>
          )}
          {status === 'muted' && (
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-600/20 border border-red-500/60 text-red-300 text-xs font-mono font-semibold tracking-wide shadow-md shadow-red-500/20">
              <MicOff size={14} className="text-red-400" />
              <span>MICROPHONE MUTED (OFF)</span>
            </div>
          )}
        </div>

        {/* Live Subtitles & Text Display Area */}
        <div className="w-full mt-2 min-h-[90px] max-h-40 overflow-y-auto px-4 py-3 rounded-2xl bg-black/40 border border-white/10 text-center flex flex-col items-center justify-center relative">
          {interimTranscript && (
            <p className="text-sm font-medium text-amber-300 italic animate-pulse">
              "{interimTranscript}..."
            </p>
          )}

          {!interimTranscript && userTranscript && status === 'thinking' && (
            <p className="text-xs text-zinc-400 font-mono mb-1">
              {firstName}: <span className="text-zinc-200">"{userTranscript}"</span>
            </p>
          )}

          {assistantReply ? (
            <div className="flex flex-col items-center">
              <p className="text-sm md:text-base font-medium text-white leading-relaxed max-w-xl">
                {assistantReply}
              </p>
              {/* Prominent Replay Button */}
              <div className="flex items-center gap-2 mt-2.5">
                <button
                  onClick={handleReplay}
                  disabled={status === 'speaking'}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/35 border border-orange-500/50 text-xs font-mono font-semibold text-orange-300 disabled:opacity-40 transition-all cursor-pointer shadow-sm shadow-orange-500/20"
                  title="Replay F.R.I.D.A.Y.'s spoken reply"
                >
                  <Volume2 size={13} className={status === 'speaking' ? 'animate-bounce text-orange-400' : ''} />
                  <span>{status === 'speaking' ? 'Speaking...' : '🔊 Replay Voice'}</span>
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-500 font-mono">
              Speak or type: "Hello Friday", "What is my next task?", or "आज क्या नया है?"
            </p>
          )}
        </div>

        {/* In-Modal Text / Voice Send Input Bar */}
        <div className="w-full mt-3 flex items-center gap-2">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && textInput.trim()) {
                handleManualSend();
              }
            }}
            placeholder={status === 'muted' ? 'Mic muted — type your message to Friday...' : 'Speak or type to Friday...'}
            className="flex-1 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs text-white placeholder-zinc-500 outline-none focus:border-orange-500/50 transition-colors"
          />
          <button
            onClick={handleManualSend}
            disabled={status === 'thinking'}
            className="px-4 py-2 rounded-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-semibold font-mono flex items-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-orange-600/30"
          >
            <Send size={13} />
            <span>Send</span>
          </button>
        </div>

        {/* Conversation History Drawer (Collapsible) */}
        {showHistory && (
          <div className="w-full mt-3 p-3 rounded-2xl bg-zinc-950/80 border border-white/10 max-h-36 overflow-y-auto text-left text-xs space-y-2 animate-in fade-in duration-200">
            <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 pb-1 border-b border-white/5">
              Voice Session History
            </div>
            {historyItems.length === 0 ? (
              <p className="text-zinc-500 italic">No previous speech in this session.</p>
            ) : (
              historyItems.map((item, idx) => (
                <div key={idx} className="flex gap-2">
                  <span
                    className={`font-semibold shrink-0 font-mono text-[11px] ${
                      item.role === 'user' ? 'text-amber-400' : 'text-orange-400'
                    }`}
                  >
                    {item.role === 'user' ? `${firstName}:` : 'F.R.I.D.A.Y.:'}
                  </span>
                  <span className="text-zinc-300">{item.text}</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Bottom Control Bar */}
        <div className="flex items-center gap-3 mt-4 flex-wrap justify-center">
          {/* Mute / Unmute Button */}
          <button
            onClick={toggleMute}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-mono text-xs font-semibold transition-all cursor-pointer shadow-md ${
              status === 'muted'
                ? 'bg-red-600 hover:bg-red-500 text-white ring-2 ring-red-400 shadow-red-600/40'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
            }`}
          >
            {status === 'muted' ? (
              <>
                <Mic size={14} className="text-white animate-pulse" />
                <span>Unmute Mic (Currently Muted)</span>
              </>
            ) : (
              <>
                <MicOff size={14} className="text-red-400" />
                <span>Mute Mic</span>
              </>
            )}
          </button>

          {/* Interrupt / Stop Button (When Friday is speaking) */}
          {status === 'speaking' && (
            <button
              onClick={handleInterrupt}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full font-mono text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-600/30 transition-all cursor-pointer animate-pulse"
            >
              <Square size={13} className="fill-current" />
              <span>Interrupt & Speak</span>
            </button>
          )}

          {/* Reset Voice Session */}
          <button
            onClick={() => {
              unlockAudio();
              stopTts();
              stopListening();
              setUserTranscript('');
              setInterimTranscript('');
              setTextInput('');
              const welcome = `Voice systems recalibrated, ${firstName}. I'm listening.`;
              setAssistantReply(welcome);
              if (!isMutedRef.current) {
                setStatus('listening');
                startListening();
              }
            }}
            className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Reset Voice Core"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
