from typing import Optional
from pydantic import BaseModel


class ToolExecuteRequest(BaseModel):
    tool: str
    args: str
    timeout: Optional[int] = 60


class ToolExecuteResponse(BaseModel):
    stdout: str
    stderr: str
    exit_code: int
    duration: float
