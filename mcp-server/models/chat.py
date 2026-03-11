from typing import Literal, Optional
from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    conversation_id: str
    provider: Literal["openai", "anthropic", "ollama"] = "openai"
    api_key: Optional[str] = None   # user-supplied key; overrides server env var
