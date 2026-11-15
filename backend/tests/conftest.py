"""Test isolation: every test session gets its own throwaway database and storage folder.

pytest imports this file before any test module, so the environment variables below are
set before `app.core.config` builds `settings` and before `app.db.session` creates the
engine. Without this, the API tests would read and write the developer's real
`repolens.db` and `data/repos/`, and their results would depend on whatever happens to
be in those files.
"""

from __future__ import annotations

import atexit
import os
import shutil
import tempfile
from pathlib import Path

import pytest_asyncio

_TEST_ROOT = Path(tempfile.mkdtemp(prefix="spectracode-tests-"))
# atexit also runs when collection fails, which a session fixture would not.
atexit.register(shutil.rmtree, _TEST_ROOT, ignore_errors=True)

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{(_TEST_ROOT / 'test.db').as_posix()}"
os.environ["DATA_DIR"] = str(_TEST_ROOT / "data")
os.environ["REPOS_STORAGE_DIR"] = str(_TEST_ROOT / "data" / "repos")
# Tests must never call a paid LLM API, even if the developer has a key in their shell.
os.environ.pop("GEMINI_API_KEY", None)
os.environ.pop("OPENAI_API_KEY", None)

from app.core.config import settings  # noqa: E402  (must come after the environment is set)

# Fail loudly rather than silently touching real data if the override ever stops working.
assert settings.DATABASE_URL == os.environ["DATABASE_URL"], settings.DATABASE_URL
assert settings.REPOS_STORAGE_DIR.resolve().is_relative_to(_TEST_ROOT.resolve()), settings.REPOS_STORAGE_DIR


@pytest_asyncio.fixture(autouse=True)
async def _close_db_connections():
    """Close pooled connections inside the test's own event loop.

    pytest-asyncio gives each test a fresh loop. Pooled aiosqlite connections left over from
    a finished loop can't be closed later, and on Windows they keep test.db locked.
    """
    yield
    from app.db.session import engine

    await engine.dispose()
