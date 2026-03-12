from typing import Literal, Optional
from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    conversation_id: str
    provider: Literal["openai", "anthropic", "ollama", "google"] = "openai"
    api_key: Optional[str] = None   # user-supplied key; overrides server env var
    model: Optional[str] = None     # override the default model for the provider
