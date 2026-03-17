"""Database initialization and schema setup."""

from __future__ import annotations

import re

from openclaw_orchestrator.database.db import get_db

# Whitelist pattern for SQL identifiers (table names, column names)
_SQL_IDENTIFIER_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def init_database() -> None:
    db = get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS teams (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            goal TEXT DEFAULT '',
            theme TEXT DEFAULT 'default',
            schedule_json TEXT DEFAULT '{}',
            schedule_config TEXT DEFAULT '{}',
            default_workflow_id TEXT DEFAULT NULL,
            lead_mode TEXT DEFAULT 'agent',
            lead_agent_id TEXT DEFAULT NULL,
            team_dir TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS team_members (
            team_id TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member',
            join_order INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (team_id, agent_id),
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            queue_status TEXT NOT NULL DEFAULT 'backlog',
            parent_task_id TEXT DEFAULT NULL,
            planned_by TEXT DEFAULT NULL,
            blocked_reason TEXT DEFAULT '',
            last_error TEXT DEFAULT '',
            retry_count INTEGER DEFAULT 0,
            execution_id TEXT DEFAULT NULL,
            workflow_id TEXT DEFAULT NULL,
            trigger_event_id TEXT DEFAULT NULL,
            queue_seq INTEGER DEFAULT NULL,
            last_node_id TEXT DEFAULT NULL,
            queued_at TEXT,
            started_at TEXT,
            finished_at TEXT,
            last_heartbeat_at TEXT,
            next_retry_at TEXT,
            task_file_path TEXT NOT NULL,
            participant_agent_ids TEXT DEFAULT '[]',
            summary TEXT,
            artifact_count INTEGER DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT,
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS workflows (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            name TEXT NOT NULL,
            definition_json TEXT NOT NULL DEFAULT '{}',
            status TEXT DEFAULT 'draft',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS workflow_executions (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            current_node_id TEXT,
            logs TEXT DEFAULT '[]',
            prompt_tokens INTEGER DEFAULT 0,
            completion_tokens INTEGER DEFAULT 0,
            total_tokens INTEGER DEFAULT 0,
            estimated_cost_usd REAL DEFAULT 0,
            usage_metrics_count INTEGER DEFAULT 0,
            usage_samples_count INTEGER DEFAULT 0,
            usage_coverage_ratio REAL DEFAULT 0,
            model_summary_json TEXT DEFAULT '',
            started_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT,
            FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS trigger_events (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            workflow_id TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'manual',
            actor_id TEXT NOT NULL DEFAULT 'api',
            session_id TEXT DEFAULT '',
            idempotency_key TEXT NOT NULL,
            request_payload_json TEXT NOT NULL DEFAULT '{}',
            status TEXT NOT NULL DEFAULT 'accepted',
            linked_task_id TEXT DEFAULT NULL,
            linked_execution_id TEXT DEFAULT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
            FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS knowledge_entries (
            id TEXT PRIMARY KEY,
            owner_type TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            source_type TEXT NOT NULL,
            source_path TEXT NOT NULL,
            title TEXT NOT NULL,
            chunk_count INTEGER DEFAULT 0,
            content_text TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS knowledge_chunks (
            rowid INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_id TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
            content,
            tokenize='unicode61'
        );

        CREATE TABLE IF NOT EXISTS approvals (
            id TEXT PRIMARY KEY,
            execution_id TEXT NOT NULL,
            node_id TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            description TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            reject_reason TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            resolved_at TEXT,
            FOREIGN KEY (execution_id) REFERENCES workflow_executions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT DEFAULT '',
            execution_id TEXT,
            node_id TEXT,
            read INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS live_feed_messages (
            id TEXT PRIMARY KEY,
            payload_json TEXT NOT NULL,
            recorded_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS live_feed_events (
            id TEXT PRIMARY KEY,
            payload_json TEXT NOT NULL,
            recorded_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS execution_usage_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            execution_id TEXT NOT NULL,
            workflow_id TEXT NOT NULL,
            team_id TEXT NOT NULL,
            node_id TEXT NOT NULL,
            agent_id TEXT DEFAULT '',
            model TEXT DEFAULT '',
            channel TEXT DEFAULT '',
            prompt_tokens INTEGER DEFAULT 0,
            completion_tokens INTEGER DEFAULT 0,
            total_tokens INTEGER DEFAULT 0,
            estimated_cost_usd REAL DEFAULT 0,
            duration_ms INTEGER DEFAULT 0,
            has_usage INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (execution_id) REFERENCES workflow_executions(id) ON DELETE CASCADE,
            FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            team_id TEXT DEFAULT NULL,
            actor TEXT NOT NULL DEFAULT 'api',
            action TEXT NOT NULL,
            resource_type TEXT NOT NULL,
            resource_id TEXT DEFAULT '',
            detail TEXT DEFAULT '',
            metadata_json TEXT DEFAULT '',
            ok INTEGER NOT NULL DEFAULT 1,
            request_id TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_team_id ON tasks(team_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_team_queue ON tasks(team_id, queue_status, queue_seq, queued_at);
        CREATE INDEX IF NOT EXISTS idx_tasks_retry_ready ON tasks(team_id, queue_status, next_retry_at);
        CREATE INDEX IF NOT EXISTS idx_trigger_events_team_workflow_key_created ON trigger_events(team_id, workflow_id, idempotency_key, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_trigger_events_status ON trigger_events(status);
        CREATE INDEX IF NOT EXISTS idx_team_members_agent ON team_members(agent_id);
        CREATE INDEX IF NOT EXISTS idx_knowledge_owner ON knowledge_entries(owner_type, owner_id);
        CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_entry ON knowledge_chunks(entry_id, chunk_index);
        CREATE INDEX IF NOT EXISTS idx_approvals_execution ON approvals(execution_id);
        CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
        CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
        CREATE INDEX IF NOT EXISTS idx_notifications_execution ON notifications(execution_id);
        CREATE INDEX IF NOT EXISTS idx_live_feed_messages_recorded_at ON live_feed_messages(recorded_at DESC);
        CREATE INDEX IF NOT EXISTS idx_live_feed_events_recorded_at ON live_feed_events(recorded_at DESC);
        CREATE INDEX IF NOT EXISTS idx_execution_usage_metrics_execution ON execution_usage_metrics(execution_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_execution_usage_metrics_team_created ON execution_usage_metrics(team_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_execution_usage_metrics_team_model_created ON execution_usage_metrics(team_id, model, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_execution_usage_metrics_team_agent_created ON execution_usage_metrics(team_id, agent_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_execution_usage_metrics_team_workflow_created ON execution_usage_metrics(team_id, workflow_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_team_created ON audit_logs(team_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON audit_logs(action, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_created ON audit_logs(resource_type, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_ok_created ON audit_logs(ok, created_at DESC);
    """)

    _migrate_add_column(db, "workflow_executions", "context_json", "TEXT DEFAULT NULL")
    _migrate_add_column(db, "workflow_executions", "prompt_tokens", "INTEGER DEFAULT 0")
    _migrate_add_column(db, "workflow_executions", "completion_tokens", "INTEGER DEFAULT 0")
    _migrate_add_column(db, "workflow_executions", "total_tokens", "INTEGER DEFAULT 0")
    _migrate_add_column(db, "workflow_executions", "estimated_cost_usd", "REAL DEFAULT 0")
    _migrate_add_column(db, "workflow_executions", "usage_metrics_count", "INTEGER DEFAULT 0")
    _migrate_add_column(db, "workflow_executions", "usage_samples_count", "INTEGER DEFAULT 0")
    _migrate_add_column(db, "workflow_executions", "usage_coverage_ratio", "REAL DEFAULT 0")
    _migrate_add_column(db, "workflow_executions", "model_summary_json", "TEXT DEFAULT ''")
    # 为 tasks 表添加 assigned_agent_id 列（排班分配的 Agent）
    _migrate_add_column(db, "tasks", "assigned_agent_id", "TEXT DEFAULT NULL")
    _migrate_add_column(db, "tasks", "queue_status", "TEXT DEFAULT 'backlog'")
    _migrate_add_column(db, "tasks", "parent_task_id", "TEXT DEFAULT NULL")
    _migrate_add_column(db, "tasks", "planned_by", "TEXT DEFAULT NULL")
    _migrate_add_column(db, "tasks", "blocked_reason", "TEXT DEFAULT ''")
    _migrate_add_column(db, "tasks", "last_error", "TEXT DEFAULT ''")
    _migrate_add_column(db, "tasks", "retry_count", "INTEGER DEFAULT 0")
    _migrate_add_column(db, "tasks", "execution_id", "TEXT DEFAULT NULL")
    _migrate_add_column(db, "tasks", "last_node_id", "TEXT DEFAULT NULL")
    _migrate_add_column(db, "tasks", "queued_at", "TEXT DEFAULT NULL")
    _migrate_add_column(db, "tasks", "started_at", "TEXT DEFAULT NULL")
    _migrate_add_column(db, "tasks", "finished_at", "TEXT DEFAULT NULL")
    _migrate_add_column(db, "tasks", "last_heartbeat_at", "TEXT DEFAULT NULL")
    _migrate_add_column(db, "tasks", "next_retry_at", "TEXT DEFAULT NULL")

    _migrate_add_column(db, "trigger_events", "source", "TEXT DEFAULT 'manual'")
    _migrate_add_column(db, "trigger_events", "actor_id", "TEXT DEFAULT 'api'")
    _migrate_add_column(db, "trigger_events", "session_id", "TEXT DEFAULT ''")
    _migrate_add_column(db, "trigger_events", "request_payload_json", "TEXT DEFAULT ''")
    _migrate_add_column(db, "trigger_events", "status", "TEXT DEFAULT 'accepted'")
    _migrate_add_column(db, "trigger_events", "linked_task_id", "TEXT DEFAULT NULL")
    _migrate_add_column(db, "trigger_events", "linked_execution_id", "TEXT DEFAULT NULL")
    _migrate_add_column(db, "trigger_events", "updated_at", "TEXT DEFAULT (datetime('now'))")

    # teams 历史兼容字段补齐
    _migrate_add_column(db, "teams", "schedule_config", "TEXT DEFAULT NULL")
    _migrate_add_column(db, "teams", "default_workflow_id", "TEXT DEFAULT NULL")
    _migrate_add_column(db, "teams", "lead_mode", "TEXT DEFAULT 'agent'")

    _migrate_add_column(db, "knowledge_entries", "content_text", "TEXT DEFAULT ''")
    _ensure_knowledge_tables(db)

    _migrate_add_column(db, "knowledge_entries", "content_text", "TEXT DEFAULT ''")
    _ensure_knowledge_tables(db)

    # 调度任务状态表（记录排班调度的执行历史）
    db.executescript("""
        CREATE TABLE IF NOT EXISTS schedule_jobs (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            mode TEXT NOT NULL,
            cron_expression TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            last_triggered_at TEXT,
            next_trigger_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_schedule_jobs_team ON schedule_jobs(team_id);
        CREATE INDEX IF NOT EXISTS idx_schedule_jobs_agent ON schedule_jobs(agent_id);
        CREATE INDEX IF NOT EXISTS idx_schedule_jobs_status ON schedule_jobs(status);
    """)
    # 会议表
    db.executescript("""
        CREATE TABLE IF NOT EXISTS meetings (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            meeting_type TEXT NOT NULL,
            topic TEXT NOT NULL,
            topic_description TEXT DEFAULT '',
            lead_agent_id TEXT NOT NULL,
            participants TEXT NOT NULL DEFAULT '[]',
            status TEXT DEFAULT 'preparing',
            file_path TEXT,
            summary TEXT,
            max_rounds INTEGER DEFAULT 1,
            current_round INTEGER DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            concluded_at TEXT,
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_meetings_team ON meetings(team_id);
        CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
    """)

    print("Database initialized successfully")


def _validate_sql_identifier(value: str, label: str) -> None:
    """Validate that a value is a safe SQL identifier (table/column name).

    Args:
        value: The identifier to validate.
        label: Human-readable label for error messages (e.g. "table name").

    Raises:
        ValueError: If the identifier contains unsafe characters.
    """
    if not _SQL_IDENTIFIER_RE.match(value):
        raise ValueError(
            f"Unsafe SQL {label}: '{value}'. "
            f"Only alphanumeric characters and underscores are allowed."
        )


# Whitelist of tables that are allowed to be migrated
_ALLOWED_TABLES = {
    "teams", "team_members", "tasks", "workflows",
    "workflow_executions", "execution_usage_metrics", "trigger_events", "knowledge_entries", "approvals",
    "notifications", "audit_logs", "schedule_jobs", "meetings",
}


def _migrate_add_column(db, table: str, column: str, column_def: str) -> None:
    """Safely add a column to an existing table (no-op if column already exists).

    All identifiers are validated against a strict whitelist pattern to
    prevent SQL injection via dynamic DDL statements.
    """
    # Validate all dynamic identifiers
    _validate_sql_identifier(table, "table name")
    _validate_sql_identifier(column, "column name")

    # Additionally check table is in known whitelist
    if table not in _ALLOWED_TABLES:
        raise ValueError(
            f"Table '{table}' is not in the allowed migration whitelist. "
            f"Allowed tables: {_ALLOWED_TABLES}"
        )

    # Validate column_def only contains safe characters (type + default clause)
    if not re.match(r"^[a-zA-Z0-9_ ()'\"]+$", column_def):
        raise ValueError(f"Unsafe column definition: '{column_def}'")


    cursor = db.execute(f"PRAGMA table_info({table})")
    existing_columns = {row[1] for row in cursor.fetchall()}
    if column not in existing_columns:
        db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {column_def}")
        db.commit()


def _ensure_knowledge_tables(db) -> None:
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS knowledge_chunks (
            rowid INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_id TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
        )
        """
    )
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_entry ON knowledge_chunks(entry_id, chunk_index)"
    )
    db.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(content, tokenize='unicode61')"
    )
    db.commit()
