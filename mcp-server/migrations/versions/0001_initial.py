"""initial

Revision ID: 0001
Revises:
Create Date: 2026-03-11 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id",              postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("username",        sa.String(50),  nullable=False),
        sa.Column("email",           sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("is_active",       sa.Boolean(),   nullable=False, server_default="true"),
        sa.Column("is_admin",        sa.Boolean(),   nullable=False, server_default="false"),
        sa.Column("created_at",      sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at",      sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("username", name="uq_users_username"),
        sa.UniqueConstraint("email",    name="uq_users_email"),
    )
    op.create_index("idx_users_username", "users", ["username"])
    op.create_index("idx_users_email",    "users", ["email"])

    op.create_table(
        "conversations",
        sa.Column("id",         postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id",    postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title",      sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_conversations_user_id", "conversations", ["user_id"])

    op.create_table(
        "messages",
        sa.Column("id",              postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role",            sa.String(20), nullable=False),
        sa.Column("content",         sa.Text(),     nullable=False),
        sa.Column("tokens_used",     sa.Integer()),
        sa.Column("created_at",      sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_messages_conversation_id", "messages", ["conversation_id"])
    op.create_index("idx_messages_created_at",      "messages", ["created_at"])

    op.create_table(
        "tool_executions",
        sa.Column("id",              postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id",         postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id",         ondelete="CASCADE"),  nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tool",            sa.String(50), nullable=False),
        sa.Column("args",            sa.Text(),     nullable=False),
        sa.Column("stdout",          sa.Text()),
        sa.Column("stderr",          sa.Text()),
        sa.Column("exit_code",       sa.Integer()),
        sa.Column("duration",        sa.Numeric(8, 3)),
        sa.Column("executed_at",     sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_tool_executions_user_id",     "tool_executions", ["user_id"])
    op.create_index("idx_tool_executions_executed_at", "tool_executions", ["executed_at"])
    op.create_index("idx_tool_executions_tool",        "tool_executions", ["tool"])


def downgrade() -> None:
    op.drop_table("tool_executions")
    op.drop_table("messages")
    op.drop_table("conversations")
    op.drop_table("users")
