"""Database initialization - create tables and indexes."""

from openclaw_orchestrator.database.db import get_db


def init_database() -> None:
    """Initialize the database schema."""
    db = get_db()

    db.executescript("""
        CREATE TABLE IF NOT EXISTS teams (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            goal TEXT DEFAULT '',
            schedule_config TEXT DEFAULT '{}',
            theme TEXT DEFAULT 'default',
            team_dir TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS team_members (
            team_id TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            role TEXT DEFAULT 'member',
            join_order INTEGER DEFAULT 0,
            PRIMARY KEY (team_id, agent_id),
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
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
            started_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT,
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
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- 审批记录表
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

        -- 通知表
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

        CREATE INDEX IF NOT EXISTS idx_tasks_team_id ON tasks(team_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_team_members_agent ON team_members(agent_id);
        CREATE INDEX IF NOT EXISTS idx_knowledge_owner ON knowledge_entries(owner_type, owner_id);
        CREATE INDEX IF NOT EXISTS idx_approvals_execution ON approvals(execution_id);
        CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
        CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
        CREATE INDEX IF NOT EXISTS idx_notifications_execution ON notifications(execution_id);
    """)

    # 兼容性升级：为已有的 workflow_executions 表添加 context_json 列
    _migrate_add_column(db, "workflow_executions", "context_json", "TEXT DEFAULT NULL")

    # 为 tasks 表添加 assigned_agent_id 列（排班分配的 Agent）
    _migrate_add_column(db, "tasks", "assigned_agent_id", "TEXT DEFAULT NULL")

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

    print("📦 Database initialized successfully")


def _migrate_add_column(db, table: str, column: str, column_def: str) -> None:
    """Safely add a column to an existing table (no-op if column already exists)."""
    cursor = db.execute(f"PRAGMA table_info({table})")
    existing_columns = {row[1] for row in cursor.fetchall()}
    if column not in existing_columns:
        db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {column_def}")
        db.commit()
        print(f"  ↳ Migrated: added {column} to {table}")
