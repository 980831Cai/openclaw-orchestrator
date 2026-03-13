import sqlite3
from pathlib import Path

path = Path(r"C:\Users\Administrator\.openclaw\orchestrator.sqlite")
print("db", path, path.exists())
conn = sqlite3.connect(path)
cur = conn.cursor()
print("tables", cur.execute("select name from sqlite_master where type='table' order by name").fetchall())
print("workflow_count", cur.execute("select count(*) from workflows").fetchone()[0])
print("execution_count", cur.execute("select count(*) from workflow_executions").fetchone()[0])
print("approval_count", cur.execute("select count(*) from approvals").fetchone()[0])
print("latest executions")
for row in cur.execute("select id, workflow_id, status, started_at, completed_at, current_node_id, substr(context_json,1,160) from workflow_executions order by rowid desc limit 25").fetchall():
    print(row)
print("latest approvals")
for row in cur.execute("select id, execution_id, node_id, status, created_at, resolved_at from approvals order by rowid desc limit 20").fetchall():
    print(row)
print("enabled schedules")
for row in cur.execute("select id, name, json_extract(definition_json, '$.schedule.activeUntil'), json_extract(definition_json, '$.schedule.nextRunAt'), json_extract(definition_json, '$.schedule.cron') from workflows where json_extract(definition_json, '$.schedule.enabled') = 1 order by rowid desc limit 60").fetchall():
    print(row)
print("workflow notifications")
for row in cur.execute("select id, type, title, message, created_at from notifications where type in ('workflow_completed', 'workflow_error') order by rowid desc limit 40").fetchall():
    print(row)
