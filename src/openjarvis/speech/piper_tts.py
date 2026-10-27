"""Piper TTS backend — fast, fully offline neural voice synthesis.

Piper runs entirely on-device (no internet needed after first download).
On first use this backend downloads the Piper Windows binary and the
requested ONNX voice model automatically, so there is nothing manual
to install.

Piper GitHub: https://github.com/rhasspy/piper
"""

from __future__ import annotations

import io
import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path
from typing import List

from openjarvis.core.registry import TTSRegistry
from openjarvis.speech.tts import TTSBackend, TTSResult

logger = logging.getLogger(__name__)

# ── Default settings ──────────────────────────────────────────────────────────
_DEFAULT_VOICE = "en_US-lessac-medium"   # Pleasant, clear US English female
_PIPER_DIR = Path(os.environ.get("PIPER_DIR", Path.home() / ".friday" / "piper"))

# ── Piper Windows release ─────────────────────────────────────────────────────
_PIPER_VERSION = "2023.11.14-2"
_PIPER_ZIP_URL = (
    f"https://github.com/rhasspy/piper/releases/download/"
    f"{_PIPER_VERSION}/piper_windows_amd64.zip"
)

# ── Voice model registry (name → HuggingFace download URL base) ───────────────
# Each voice needs two files: <name>.onnx and <name>.onnx.json
_VOICE_BASE_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main"
_VOICE_PATHS: dict[str, str] = {
    # English (US)
    "en_US-lessac-medium":    "en/en_US/lessac/medium/en_US-lessac-medium",
    "en_US-amy-medium":       "en/en_US/amy/medium/en_US-amy-medium",
    "en_US-joe-medium":       "en/en_US/joe/medium/en_US-joe-medium",
    "en_US-ryan-high":        "en/en_US/ryan/high/en_US-ryan-high",
    # English (UK / Ireland)
    "en_GB-alba-medium":      "en/en_GB/alba/medium/en_GB-alba-medium",
    "en_GB-jenny-dioco-medium": "en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium",
    # Hindi
    "hi_IN-pratima-medium":   "hi/hi_IN/pratima/medium/hi_IN-pratima-medium",
}

# Voice sample rates (from Piper model specs)
_VOICE_SAMPLE_RATE: dict[str, int] = {
    "en_US-lessac-medium":       22050,
    "en_US-amy-medium":          22050,
    "en_US-joe-medium":          22050,
    "en_US-ryan-high":           22050,
    "en_GB-alba-medium":         22050,
    "en_GB-jenny-dioco-medium":  22050,
    "hi_IN-pratima-medium":      22050,
}


def _piper_exe() -> Path:
    """Return path to piper.exe, downloading if needed."""
    exe = _PIPER_DIR / "piper.exe"
    if exe.exists():
        return exe

    logger.info("Downloading Piper TTS binary to %s …", _PIPER_DIR)
    _PIPER_DIR.mkdir(parents=True, exist_ok=True)

    zip_path = _PIPER_DIR / "piper.zip"
    try:
        urllib.request.urlretrieve(_PIPER_ZIP_URL, zip_path)
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(_PIPER_DIR)
        # The zip extracts into a sub-directory "piper/" — move up if needed
        nested = _PIPER_DIR / "piper" / "piper.exe"
        if nested.exists() and not exe.exists():
            for item in (_PIPER_DIR / "piper").iterdir():
                shutil.move(str(item), str(_PIPER_DIR / item.name))
            (_PIPER_DIR / "piper").rmdir()
        zip_path.unlink(missing_ok=True)
        logger.info("Piper downloaded successfully.")
    except Exception as exc:
        logger.error("Failed to download Piper: %s", exc)
        raise RuntimeError(f"Could not download Piper binary: {exc}") from exc

    if not exe.exists():
        raise RuntimeError(f"piper.exe not found after extraction in {_PIPER_DIR}")
    return exe


def _voice_model(voice_id: str) -> tuple[Path, Path]:
    """Return (onnx_path, json_path) for *voice_id*, downloading if needed."""
    onnx = _PIPER_DIR / f"{voice_id}.onnx"
    config = _PIPER_DIR / f"{voice_id}.onnx.json"

    if onnx.exists() and config.exists():
        return onnx, config

    base_path = _VOICE_PATHS.get(voice_id)
    if base_path is None:
        raise ValueError(
            f"Unknown Piper voice: {voice_id!r}. "
            f"Available: {list(_VOICE_PATHS)}"
        )

    logger.info("Downloading Piper voice model '%s' …", voice_id)
    _PIPER_DIR.mkdir(parents=True, exist_ok=True)

    for suffix, dest in [(".onnx", onnx), (".onnx.json", config)]:
        url = f"{_VOICE_BASE_URL}/{base_path}{suffix}"
        try:
            urllib.request.urlretrieve(url, dest)
            logger.debug("Downloaded %s → %s", url, dest)
        except Exception as exc:
            logger.error("Failed to download %s: %s", url, exc)
            raise RuntimeError(
                f"Could not download Piper voice model '{voice_id}': {exc}"
            ) from exc

    logger.info("Piper voice '%s' ready.", voice_id)
    return onnx, config


def _raw_to_wav(raw_bytes: bytes, sample_rate: int = 22050) -> bytes:
    """Wrap raw 16-bit little-endian PCM into a minimal WAV file."""
    import struct

    num_channels = 1
    bits_per_sample = 16
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    data_size = len(raw_bytes)
    chunk_size = 36 + data_size

    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        chunk_size,
        b"WAVE",
        b"fmt ",
        16,            # PCM chunk size
        1,             # PCM format
        num_channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        b"data",
        data_size,
    )
    return header + raw_bytes


@TTSRegistry.register("piper")
class PiperTTSBackend(TTSBackend):
    """Piper TTS backend — fully offline neural voice synthesis.

    On first call, automatically downloads the Piper executable and the
    requested ONNX voice model to ``~/.friday/piper/``.

    Supported voices: en_US-lessac-medium (default), en_US-amy-medium,
    en_US-joe-medium, en_US-ryan-high, en_GB-alba-medium,
    en_GB-jenny-dioco-medium, hi_IN-pratima-medium.
    """

    backend_id = "piper"

    def __init__(self, *, voice_id: str = "") -> None:
        self._default_voice = voice_id or _DEFAULT_VOICE

    # ------------------------------------------------------------------
    def synthesize(
        self,
        text: str,
        *,
        voice_id: str = "",
        speed: float = 1.0,
        output_format: str = "wav",
    ) -> TTSResult:
        v = voice_id or self._default_voice

        exe = _piper_exe()
        onnx, _config = _voice_model(v)
        sample_rate = _VOICE_SAMPLE_RATE.get(v, 22050)

        # Build piper command — output raw PCM to stdout
        cmd = [
            str(exe),
            "--model", str(onnx),
            "--output_raw",
            "--sentence_silence", "0.3",
        ]

        # Speed: piper uses --length_scale (inverse of speed)
        if speed and speed != 1.0:
            length_scale = round(1.0 / max(speed, 0.1), 3)
            cmd += ["--length_scale", str(length_scale)]

        logger.debug("Piper cmd: %s", cmd)

        try:
            result = subprocess.run(
                cmd,
                input=text.encode("utf-8"),
                capture_output=True,
                timeout=30,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(f"Piper executable not found: {exe}") from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("Piper TTS timed out after 30s") from exc

        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace")
            raise RuntimeError(f"Piper exited {result.returncode}: {stderr}")

        raw_pcm = result.stdout
        if not raw_pcm:
            raise RuntimeError("Piper produced no audio output")

        # Wrap raw PCM in WAV header
        wav_bytes = _raw_to_wav(raw_pcm, sample_rate)
        duration = len(raw_pcm) / (sample_rate * 2)  # 16-bit = 2 bytes/sample

        return TTSResult(
            audio=wav_bytes,
            format="wav",
            duration_seconds=duration,
            voice_id=v,
            sample_rate=sample_rate,
            metadata={"backend": "piper", "voice": v},
        )

    # ------------------------------------------------------------------
    def available_voices(self) -> List[str]:
        return list(_VOICE_PATHS.keys())

    # ------------------------------------------------------------------
    def health(self) -> bool:
        """Check if Piper is available (or can be downloaded)."""
        try:
            exe = _PIPER_DIR / "piper.exe"
            if exe.exists():
                r = subprocess.run(
                    [str(exe), "--help"],
                    capture_output=True,
                    timeout=5,
                )
                return r.returncode == 0
            # Binary not yet downloaded — treat as healthy (will download on demand)
            return sys.platform == "win32"
        except Exception:
            return False


__all__ = ["PiperTTSBackend"]
