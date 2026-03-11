"""
MCP Server configuration — all values sourced from environment variables.
Uses pydantic-settings BaseSettings for automatic env var parsing and validation.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # OpenAI (optional — user can provide key per-request)
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    # Anthropic (optional — user can provide key per-request)
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-3-5-sonnet-20241022"

    # Ollama fallback
    ollama_host: str = "http://ollama:11434"
    ollama_model: str = "llama3"

    # Kali sidecar
    kali_sidecar_url: str = "http://kali-sidecar:5000"

    # PostgreSQL
    postgres_dsn: str  # must use postgresql+asyncpg:// scheme

    # Redis
    redis_url: str = "redis://:password@redis:6379/0"

    # JWT
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24

    # App
    app_env: str = "production"
    cors_origins: list[str] = ["http://localhost:3000"]
    rate_limit_per_minute: int = 60


settings = Settings()
