"""Knowledge base management service."""

from __future__ import annotations

import uuid
from typing import Any, Optional

from openclaw_orchestrator.database.db import get_db
from openclaw_orchestrator.services.file_manager import file_manager


class KnowledgeService:
    """Service for managing knowledge entries."""

    def add_entry(
        self,
        owner_type: str,
        owner_id: str,
        source_type: str,
        source_path: str,
        title: str,
    ) -> dict[str, Any]:
        """Add a new knowledge entry."""
        db = get_db()
        entry_id = str(uuid.uuid4())
        chunk_count = self._estimate_chunks(source_path, source_type)

        # Store knowledge file location
        if source_type == "file":
            knowledge_dir = (
                f"memory/{owner_id}"
                if owner_type == "agent"
                else f"teams/{owner_id}/knowledge"
            )
            file_manager.ensure_dir(knowledge_dir)

        db.execute(
            "INSERT INTO knowledge_entries (id, owner_type, owner_id, source_type, source_path, title, chunk_count) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (entry_id, owner_type, owner_id, source_type, source_path, title, chunk_count),
        )
        db.commit()
        return self.get_entry(entry_id)

    def get_entry(self, entry_id: str) -> dict[str, Any]:
        """Get a knowledge entry by ID."""
        db = get_db()
        row = db.execute(
            "SELECT * FROM knowledge_entries WHERE id = ?", (entry_id,)
        ).fetchone()
        if not row:
            raise ValueError(f"Knowledge entry not found: {entry_id}")
        return self._map_row(row)

    def list_entries(self, owner_type: str, owner_id: str) -> list[dict[str, Any]]:
        """List knowledge entries for an owner."""
        db = get_db()
        rows = db.execute(
            "SELECT * FROM knowledge_entries WHERE owner_type = ? AND owner_id = ? ORDER BY created_at DESC",
            (owner_type, owner_id),
        ).fetchall()
        return [self._map_row(r) for r in rows]

    def delete_entry(self, entry_id: str) -> None:
        """Delete a knowledge entry."""
        db = get_db()
        db.execute("DELETE FROM knowledge_entries WHERE id = ?", (entry_id,))
        db.commit()

    def search(
        self, owner_type: str, owner_id: str, query: str
    ) -> list[dict[str, Any]]:
        """Simple keyword-based search (placeholder for vector search)."""
        entries = self.list_entries(owner_type, owner_id)
        query_lower = query.lower()
        results = []

        for entry in entries:
            title_match = query_lower in entry["title"].lower()
            score = 0.8 if title_match else 0.3

            if title_match or score > 0.2:
                source_label = "文件" if entry["sourceType"] == "file" else "URL"
                results.append(
                    {
                        "content": f"来源: {entry['title']} ({source_label}: {entry['sourcePath']})",
                        "score": score,
                        "source": entry["sourcePath"],
                        "entryId": entry["id"],
                    }
                )

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:10]

    def get_stats(self, owner_type: str, owner_id: str) -> dict[str, int]:
        """Get knowledge statistics."""
        db = get_db()
        row = db.execute(
            "SELECT COUNT(*) as total_entries, COALESCE(SUM(chunk_count), 0) as total_chunks "
            "FROM knowledge_entries WHERE owner_type = ? AND owner_id = ?",
            (owner_type, owner_id),
        ).fetchone()
        return {
            "totalEntries": row["total_entries"],
            "totalChunks": row["total_chunks"],
        }

    # ─── Private helpers ───

    @staticmethod
    def _estimate_chunks(source_path: str, source_type: str) -> int:
        if source_type == "url":
            return 5
        ext = source_path.rsplit(".", 1)[-1].lower() if "." in source_path else ""
        return {"pdf": 20, "md": 8, "txt": 10}.get(ext, 5)

    @staticmethod
    def _map_row(row: Any) -> dict[str, Any]:
        return {
            "id": row["id"],
            "ownerType": row["owner_type"],
            "ownerId": row["owner_id"],
            "sourceType": row["source_type"],
            "sourcePath": row["source_path"],
            "title": row["title"],
            "chunkCount": row["chunk_count"],
            "createdAt": row["created_at"],
        }


# Singleton instance
knowledge_service = KnowledgeService()
