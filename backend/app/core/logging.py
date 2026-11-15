"""Structured (JSON lines) logging for the backend.

Each log record is printed as one JSON object per line, for example:

    {"ts": "2026-11-15T01:40:12.512Z", "level": "WARNING", "logger": "app.generation.llm_service",
     "msg": "llm_fallback", "provider": "gemini", "reason": "ClientError: 403 ..."}

One object per line is easy to grep locally and is what log collectors (Docker, Render,
Grafana Loki, CloudWatch) parse without extra configuration. Put the facts in `extra={...}`
rather than formatting them into the message, so they arrive as separate fields.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone

# Attributes every LogRecord has. Anything else on a record came from `extra={...}`.
_STANDARD_ATTRS = set(logging.makeLogRecord({}).__dict__) | {"message", "asctime", "taskName"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _STANDARD_ATTRS and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(level: str = "INFO") -> None:
    """Send the `app.*` loggers to stdout as JSON lines. Safe to call more than once."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    app_logger = logging.getLogger("app")
    app_logger.handlers[:] = [handler]
    app_logger.setLevel(level.upper())
    app_logger.propagate = False
