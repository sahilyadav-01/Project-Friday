"""SQLite/FTS5 memory backend — zero-dependency default."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

from openjarvis.core.events import EventType, get_event_bus
from openjarvis.core.registry import MemoryRegistry
from openjarvis.tools.storage._stubs import (
    MemoryBackend,
    MemoryBackendUnavailable,
    RetrievalResult,
)


def _check_fts5(conn: sqlite3.Connection) -> bool:
    """Return True if the SQLite build includes FTS5."""
    try:
        opts = conn.execute("PRAGMA compile_options").fetchall()
        return any("FTS5" in o[0].upper() for o in opts)
    except sqlite3.Error:
        return False


class _PythonSQLiteMemory:
    """Pure-Python SQLite/FTS5 implementation for environments without the native Rust extension."""

    def __init__(self, db_path: str) -> None:
        self.db_path = str(db_path)
        if self.db_path and self.db_path != ":memory:":
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._get_conn() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS documents (
                    id         TEXT PRIMARY KEY,
                    content    TEXT NOT NULL,
                    source     TEXT NOT NULL DEFAULT '',
                    metadata   TEXT NOT NULL DEFAULT '{}',
                    created_at REAL NOT NULL
                );

                CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts
                USING fts5(
                    content,
                    source,
                    tokenize='porter unicode61'
                );
            """)

    def store(self, content: str, source: str = "", meta_json: str | None = None) -> str:
        import time
        import uuid

        doc_id = uuid.uuid4().hex
        meta_str = meta_json or "{}"
        now = time.time()
        with self._get_conn() as conn:
            cur = conn.execute(
                "INSERT INTO documents (id, content, source, metadata, created_at) VALUES (?, ?, ?, ?, ?)",
                (doc_id, content, source, meta_str, now),
            )
            rowid = cur.lastrowid
            try:
                conn.execute(
                    "INSERT INTO documents_fts (rowid, content, source) VALUES (?, ?, ?)",
                    (rowid, content, source),
                )
            except Exception:
                pass
            conn.commit()
        return doc_id

    def replace_source(
        self, source: str, documents: list[tuple[str, str | None]]
    ) -> list[str]:
        import time
        import uuid

        now = time.time()
        doc_ids: list[str] = []
        with self._get_conn() as conn:
            old_rows = conn.execute(
                "SELECT rowid FROM documents WHERE source = ?", (source,)
            ).fetchall()
            for r in old_rows:
                try:
                    conn.execute(
                        "DELETE FROM documents_fts WHERE rowid = ?", (r["rowid"],)
                    )
                except Exception:
                    pass
            conn.execute("DELETE FROM documents WHERE source = ?", (source,))

            for content, meta_json in documents:
                doc_id = uuid.uuid4().hex
                doc_ids.append(doc_id)
                cur = conn.execute(
                    "INSERT INTO documents (id, content, source, metadata, created_at) VALUES (?, ?, ?, ?, ?)",
                    (doc_id, content, source, meta_json or "{}", now),
                )
                rowid = cur.lastrowid
                try:
                    conn.execute(
                        "INSERT INTO documents_fts (rowid, content, source) VALUES (?, ?, ?)",
                        (rowid, content, source),
                    )
                except Exception:
                    pass
            conn.commit()
        return doc_ids

    def retrieve(self, query: str, top_k: int = 5) -> str:
        clean_q = "".join(c for c in query if c.isalnum() or c in " _-").strip()
        if not clean_q:
            return "[]"
        with self._get_conn() as conn:
            rows = []
            try:
                match_expr = f'"{clean_q}"*'
                rows = conn.execute(
                    """
                    SELECT d.content, d.source, d.metadata, abs(f.rank) AS score
                    FROM documents_fts f
                    JOIN documents d ON f.rowid = d.rowid
                    WHERE documents_fts MATCH ?
                    ORDER BY f.rank ASC
                    LIMIT ?
                    """,
                    (match_expr, top_k),
                ).fetchall()
            except Exception:
                pass

            if not rows:
                rows = conn.execute(
                    """
                    SELECT content, source, metadata, 1.0 AS score
                    FROM documents
                    WHERE content LIKE ?
                    LIMIT ?
                    """,
                    (f"%{clean_q}%", top_k),
                ).fetchall()

            results = []
            for r in rows:
                meta = {}
                try:
                    meta = json.loads(r["metadata"]) if r["metadata"] else {}
                except Exception:
                    pass
                results.append(
                    {
                        "content": r["content"],
                        "score": float(r["score"]) if r["score"] is not None else 0.0,
                        "source": r["source"] or "",
                        "metadata": meta,
                    }
                )
            return json.dumps(results)

    def delete(self, doc_id: str) -> bool:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT rowid FROM documents WHERE id = ?", (doc_id,)
            ).fetchone()
            if row:
                try:
                    conn.execute(
                        "DELETE FROM documents_fts WHERE rowid = ?", (row["rowid"],)
                    )
                except Exception:
                    pass
                conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
                conn.commit()
                return True
            return False

    def clear(self) -> None:
        with self._get_conn() as conn:
            conn.execute("DELETE FROM documents")
            try:
                conn.execute("DELETE FROM documents_fts")
            except Exception:
                pass
            conn.commit()

    def count(self) -> int:
        with self._get_conn() as conn:
            row = conn.execute("SELECT count(*) AS c FROM documents").fetchone()
            return int(row["c"]) if row else 0


@MemoryRegistry.register("sqlite")
class SQLiteMemory(MemoryBackend):
    """Full-text search memory backend using SQLite FTS5.

    Uses native Rust backend when available, or built-in ``sqlite3`` Python module.
    """

    backend_id: str = "sqlite"

    def __init__(self, db_path: str | Path = "") -> None:
        if not db_path:
            from openjarvis.core.config import DEFAULT_CONFIG_DIR

            db_path = str(DEFAULT_CONFIG_DIR / "memory.db")

        self._db_path = str(db_path)

        try:
            from openjarvis._rust_bridge import get_rust_module

            _rust = get_rust_module()
            self._rust_impl = _rust.SQLiteMemory(self._db_path)
        except Exception:
            self._rust_impl = _PythonSQLiteMemory(self._db_path)
        self._conn = None  # type: ignore[assignment]

    def _create_tables(self) -> None:
        self._conn.executescript("""
            CREATE TABLE IF NOT EXISTS documents (
                id       TEXT PRIMARY KEY,
                content  TEXT NOT NULL,
                source   TEXT NOT NULL DEFAULT '',
                metadata TEXT NOT NULL DEFAULT '{}',
                created_at REAL NOT NULL
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts
            USING fts5(
                content,
                source,
                tokenize='porter unicode61'
            );
        """)

    def store(
        self,
        content: str,
        *,
        source: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Persist *content* and return a unique document id."""
        meta_json = json.dumps(metadata) if metadata else None
        doc_id = self._rust_impl.store(content, source, meta_json)
        bus = get_event_bus()
        bus.publish(
            EventType.MEMORY_STORE,
            {
                "backend": self.backend_id,
                "doc_id": doc_id,
                "source": source,
            },
        )
        return doc_id

    def replace_source(
        self,
        source: str,
        documents: List[tuple[str, Optional[Dict[str, Any]]]],
    ) -> List[str]:
        """Atomically replace all documents associated with *source*."""
        payload = [
            (content, json.dumps(metadata) if metadata else None)
            for content, metadata in documents
        ]
        doc_ids = self._rust_impl.replace_source(source, payload)
        bus = get_event_bus()
        for doc_id in doc_ids:
            bus.publish(
                EventType.MEMORY_STORE,
                {
                    "backend": self.backend_id,
                    "doc_id": doc_id,
                    "source": source,
                },
            )
        return doc_ids

    def retrieve(
        self,
        query: str,
        *,
        top_k: int = 5,
        **kwargs: Any,
    ) -> List[RetrievalResult]:
        """Search via FTS5 MATCH with BM25 ranking — always via Rust backend."""
        if not query.strip():
            return []

        from openjarvis._rust_bridge import retrieval_results_from_json

        results = retrieval_results_from_json(
            self._rust_impl.retrieve(query, top_k),
        )
        bus = get_event_bus()
        bus.publish(
            EventType.MEMORY_RETRIEVE,
            {
                "backend": self.backend_id,
                "query": query,
                "num_results": len(results),
            },
        )
        return results

    def delete(self, doc_id: str) -> bool:
        """Delete a document by id — always via Rust backend."""
        return self._rust_impl.delete(doc_id)

    def clear(self) -> None:
        """Remove all stored documents — always via Rust backend."""
        self._rust_impl.clear()

    def count(self) -> int:
        """Return the number of stored documents — always via Rust backend."""
        return self._rust_impl.count()

    def close(self) -> None:
        """Close the database connection."""
        pass


__all__ = ["SQLiteMemory"]
