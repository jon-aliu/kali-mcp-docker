"""
Tools router — GET /api/tools lists available tools;
POST /api/tools/execute runs a tool directly.
"""

import structlog
from fastapi import APIRouter, Depends, Request

from middleware.auth import require_auth
from models.tool import ToolExecuteRequest, ToolExecuteResponse
from services.kali import execute_tool, get_tools

router = APIRouter()
logger = structlog.get_logger()


@router.get("/tools")
async def list_tools(_: None = Depends(require_auth)) -> dict:
    tools = await get_tools()
    return {"tools": tools}


@router.post("/tools/execute", response_model=ToolExecuteResponse)
async def execute(
    body: ToolExecuteRequest,
    request: Request,
    _: None = Depends(require_auth),
) -> ToolExecuteResponse:
    user = request.state.user
    logger.info("tool_execute", user_id=user["sub"], tool=body.tool, args=body.args)
    result = await execute_tool(body.tool, body.args, body.timeout or 60)
    return ToolExecuteResponse(**result)
