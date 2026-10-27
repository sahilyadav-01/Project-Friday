"""Edge TTS backend — high-quality neural voice synthesis via Microsoft Edge TTS."""

from __future__ import annotations

import asyncio
import concurrent.futures
from typing import List

from openjarvis.core.registry import TTSRegistry
from openjarvis.speech.tts import TTSBackend, TTSResult

_DEFAULT_VOICE = "en-IE-EmilyNeural"  # Irish female — F.R.I.D.A.Y. persona


@TTSRegistry.register("edge_tts")
class EdgeTTSBackend(TTSBackend):
    """Edge TTS backend — high-quality neural voice synthesis."""

    backend_id = "edge_tts"

    def __init__(self, *, voice_id: str = "") -> None:
        self._default_voice = voice_id or _DEFAULT_VOICE

    def synthesize(
        self,
        text: str,
        *,
        voice_id: str = "",
        speed: float = 1.0,
        output_format: str = "mp3",
    ) -> TTSResult:
        import edge_tts

        voice = voice_id or self._default_voice
        is_hindi = any("\u0900" <= ch <= "\u097f" for ch in text)
        if is_hindi and not voice.lower().startswith("hi-"):
            voice = "hi-IN-SwaraNeural"
        elif not is_hindi and voice.lower().startswith("hi-") and not any(ord(c) > 127 for c in text):
            voice = "en-IE-EmilyNeural"

        rate_str = "+0%"
        if speed and speed != 1.0:
            diff = int(round((speed - 1.0) * 100))
            rate_str = f"{diff:+d}%"

        async def _synthesize_with_voice(v: str) -> bytes:
            communicate = edge_tts.Communicate(text, v, rate=rate_str)
            data = bytearray()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    data.extend(chunk["data"])
            if not data:
                raise RuntimeError(f"Edge TTS returned no audio data for voice {v}")
            return bytes(data)

        async def _synthesize() -> bytes:
            candidate_voices = [voice]
            if is_hindi:
                for v in ["hi-IN-SwaraNeural", "hi-IN-MadhurNeural"]:
                    if v not in candidate_voices:
                        candidate_voices.append(v)
            else:
                for v in ["en-IE-EmilyNeural", "en-US-AriaNeural", "en-US-JennyNeural"]:
                    if v not in candidate_voices:
                        candidate_voices.append(v)

            last_err = None
            for v in candidate_voices:
                try:
                    return await _synthesize_with_voice(v)
                except Exception as exc:
                    last_err = exc
                    await asyncio.sleep(0.1)
            raise last_err or RuntimeError("Edge TTS synthesis failed across all voices")

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                    audio_bytes = pool.submit(asyncio.run, _synthesize()).result()
            else:
                audio_bytes = loop.run_until_complete(_synthesize())
        except RuntimeError:
            audio_bytes = asyncio.run(_synthesize())

        return TTSResult(
            audio=audio_bytes,
            format="mp3",
            voice_id=voice,
            sample_rate=24000,
            metadata={"backend": "edge_tts", "voice": voice},
        )

    def available_voices(self) -> List[str]:
        return [
            "en-IE-EmilyNeural",   # Friday (Irish Female)
            "hi-IN-SwaraNeural",   # Hindi Female (Swara)
            "en-US-AriaNeural",    # US Female
            "en-US-JennyNeural",   # US Female
            "en-GB-SoniaNeural",   # British Female
            "hi-IN-MadhurNeural",  # Hindi Male (Madhur)
            "en-US-GuyNeural",     # US Male
            "en-GB-RyanNeural",    # British Male
        ]

    def health(self) -> bool:
        try:
            import edge_tts  # noqa: F401
            return True
        except ImportError:
            return False


__all__ = ["EdgeTTSBackend"]
