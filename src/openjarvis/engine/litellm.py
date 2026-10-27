"""LiteLLM inference engine — unified access to 100+ LLM providers."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Sequence
from typing import Any, Dict, List

from openjarvis.core.registry import EngineRegistry
from openjarvis.core.types import Message
from openjarvis.engine._base import InferenceEngine, messages_to_dicts

logger = logging.getLogger(__name__)


@EngineRegistry.register("litellm")
class LiteLLMEngine(InferenceEngine):
    """Inference via LiteLLM — routes to any supported provider.

    LiteLLM normalizes all providers (OpenAI, Anthropic, Google, DeepSeek,
    Groq, Together, Fireworks, OpenRouter, Mistral, Cohere, xAI, Perplexity,
    etc.) to OpenAI-format input/output.  Model selection uses LiteLLM's
    ``provider/model`` convention, e.g. ``anthropic/claude-sonnet-4-20250514``.

    API keys are read from environment variables following each provider's
    convention (OPENAI_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY, etc.).
    """

    engine_id = "litellm"
    is_cloud = True

    def __init__(
        self,
        *,
        api_base: str | None = None,
        default_model: str | None = None,
    ) -> None:
        self._api_base = api_base
        self._default_model = default_model

    @staticmethod
    def _normalize_model(model: str) -> str:
        """Resolve model name, adding provider prefix for known families if omitted."""
        alias_map = {
            "gemini-1.5-flash": "gemini/gemini-3.1-flash-lite",
            "gemini-2.0-flash": "gemini/gemini-3.1-flash-lite",
            "gemini-2.5-flash": "gemini/gemini-3.1-flash-lite",
            "gemini-2.5-pro": "gemini/gemini-3.1-flash-lite",
            "gemini-flash": "gemini/gemini-3.1-flash-lite",
            "gemini/gemini-1.5-flash": "gemini/gemini-3.1-flash-lite",
            "gemini/gemini-2.0-flash": "gemini/gemini-3.1-flash-lite",
            "gemini/gemini-2.5-flash": "gemini/gemini-3.1-flash-lite",
            "gemini/gemini-2.5-pro": "gemini/gemini-3.1-flash-lite",
        }
        if model in alias_map:
            return alias_map[model]
        if "/" in model:
            return model
        if model.startswith("gemini-"):
            return f"gemini/{model}"
        if model.startswith("claude-"):
            return f"anthropic/{model}"
        return model

    def can_serve(self, model: str) -> bool:
        """Return True if model has a provider prefix or is recognized by LiteLLM."""
        norm = self._normalize_model(model)
        if "/" in norm:
            return True
        cloud_prefixes = ("gpt-", "o1-", "o3-", "o4-", "chatgpt-")
        if any(norm.startswith(p) for p in cloud_prefixes):
            return True
        try:
            import litellm

            litellm.get_llm_provider(norm)
            return True
        except Exception:
            return False

    def generate(
        self,
        messages: Sequence[Message],
        *,
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        import litellm

        resolved_model = self._normalize_model(model)
        call_kwargs: Dict[str, Any] = {
            "model": resolved_model,
            "messages": messages_to_dicts(messages),
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if self._api_base:
            call_kwargs["api_base"] = self._api_base
        # Pass through tools if provided
        if "tools" in kwargs:
            call_kwargs["tools"] = kwargs.pop("tools")
        call_kwargs.update(kwargs)

        try:
            resp = litellm.completion(**call_kwargs)
        except getattr(litellm.exceptions, "BadRequestError", Exception) as exc:
            msg = str(exc)
            if "LLM Provider NOT provided" in msg:
                raise ValueError(
                    f"Model '{model}' has no LLM provider specified for LiteLLM. "
                    "For cloud models specify provider/model (e.g. 'gemini/gemini-2.5-flash' or 'openai/gpt-4o'). "
                    "For local models, please start Ollama or switch to a cloud model."
                ) from exc
            raise

        choice = resp.choices[0]
        usage = resp.usage
        prompt_tokens = usage.prompt_tokens if usage else 0
        completion_tokens = usage.completion_tokens if usage else 0

        result: Dict[str, Any] = {
            "content": choice.message.content or "",
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": (usage.total_tokens if usage else 0),
            },
            "model": resp.model,
            "finish_reason": choice.finish_reason or "stop",
        }

        # Extract tool_calls in flat format (id, name, arguments)
        if hasattr(choice.message, "tool_calls") and choice.message.tool_calls:
            result["tool_calls"] = [
                {
                    "id": tc.id,
                    "name": tc.function.name,
                    "arguments": tc.function.arguments,
                }
                for tc in choice.message.tool_calls
            ]

        # Cost tracking via litellm's built-in cost calculation
        try:
            cost = litellm.completion_cost(completion_response=resp)
            result["cost_usd"] = cost
        except Exception as exc:
            logger.debug("Failed to compute cost for LiteLLM call: %s", exc)
            result["cost_usd"] = 0.0

        return result

    async def stream(
        self,
        messages: Sequence[Message],
        *,
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        import litellm

        resolved_model = self._normalize_model(model)
        call_kwargs: Dict[str, Any] = {
            "model": resolved_model,
            "messages": messages_to_dicts(messages),
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        if self._api_base:
            call_kwargs["api_base"] = self._api_base
        call_kwargs.update(kwargs)

        try:
            resp = await litellm.acompletion(**call_kwargs)
        except getattr(litellm.exceptions, "BadRequestError", Exception) as exc:
            msg = str(exc)
            if "LLM Provider NOT provided" in msg:
                raise ValueError(
                    f"Model '{model}' has no LLM provider specified for LiteLLM. "
                    "For cloud models specify provider/model (e.g. 'gemini/gemini-2.5-flash' or 'openai/gpt-4o'). "
                    "For local models, please start Ollama or switch to a cloud model."
                ) from exc
            raise

        async for chunk in resp:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield delta.content

    def list_models(self) -> List[str]:
        if self._default_model and self.can_serve(self._default_model):
            return [self._default_model]
        return []

    def health(self) -> bool:
        try:
            import litellm  # noqa: F401

            return True
        except ImportError:
            return False


__all__ = ["LiteLLMEngine"]
