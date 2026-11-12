from __future__ import annotations

import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Generator, List, Optional, Set, Tuple

from app.core.config import settings


@dataclass
class DiscoveredFile:
    relative_path: str
    absolute_path: Path
    language: str
    size_bytes: int
    line_count: int
    content: str


class GitRepositoryImporter:
    """
    Handles cloning, sandboxing, and filtering of public GitHub repositories.
    Guarantees that repository code is never executed.
    """

    EXCLUDED_DIRS: Set[str] = {
        ".git",
        "node_modules",
        ".next",
        "dist",
        "build",
        "__pycache__",
        ".venv",
        "venv",
        ".pytest_cache",
        ".mypy_cache",
        ".turbo",
        "target",
        "vendor",
        ".idea",
        ".vscode",
    }

    EXCLUDED_EXTENSIONS: Set[str] = {
        ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp",
        ".mp4", ".mp3", ".wav", ".avi",
        ".zip", ".tar", ".gz", ".7z", ".rar",
        ".exe", ".dll", ".so", ".dylib", ".bin",
        ".pyc", ".pyo", ".pyd",
        ".lock", ".map", ".min.js", ".min.css",
        ".db", ".sqlite", ".sqlite3",
        ".woff", ".woff2", ".ttf", ".eot",
        ".pdf", ".docx", ".xlsx",
    }

    MAX_FILE_SIZE_BYTES: int = 1024 * 1024  # 1 MB

    @classmethod
    def parse_repo_identifier(cls, repo_input: str) -> Tuple[str, str, str]:
        """
        Parses inputs like 'https://github.com/fastapi/fastapi' or 'fastapi/fastapi'
        into (owner, name, clone_url).
        """
        clean = repo_input.strip().rstrip("/")
        if clean.endswith(".git"):
            clean = clean[:-4]

        # Check for URL match
        url_match = re.search(r"github\.com[/:]([\w.-]+)/([\w.-]+)", clean, re.IGNORECASE)
        if url_match:
            owner, name = url_match.group(1), url_match.group(2)
            return owner, name, f"https://github.com/{owner}/{name}.git"

        # Check for owner/repo format
        parts = clean.split("/")
        if len(parts) == 2 and parts[0] and parts[1]:
            owner, name = parts[0], parts[1]
            return owner, name, f"https://github.com/{owner}/{name}.git"

        raise ValueError(f"Invalid GitHub repository identifier or URL: '{repo_input}'")

    @classmethod
    def clone_repository(cls, clone_url: str, target_dir: Path) -> str:
        """
        Executes a safe, shallow, single-branch git clone into target_dir.
        Returns the HEAD commit SHA.
        """
        if target_dir.exists():
            shutil.rmtree(target_dir, ignore_errors=True)
        target_dir.mkdir(parents=True, exist_ok=True)

        cmd = [
            "git",
            "clone",
            "--depth", "1",
            "--single-branch",
            clone_url,
            str(target_dir),
        ]

        try:
            res = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,
                check=True,
            )
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"Git clone failed: {e.stderr or e.stdout}")
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"Git clone timed out after 120s for {clone_url}")

        # Get commit SHA
        try:
            sha_res = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=str(target_dir),
                capture_output=True,
                text=True,
                check=True,
            )
            return sha_res.stdout.strip()
        except Exception:
            return "unknown-sha"

    @classmethod
    def is_binary_content(cls, file_path: Path) -> bool:
        """Inspects first 8KB of file for null bytes."""
        try:
            with open(file_path, "rb") as f:
                chunk = f.read(8192)
                return b"\x00" in chunk
        except Exception:
            return True

    @classmethod
    def scan_files(cls, repo_dir: Path) -> Generator[DiscoveredFile, None, None]:
        """
        Walks directory and yields valid, non-binary, supported source files.
        """
        from app.ingestion.ast_chunker import CodeASTChunker

        chunker = CodeASTChunker()

        for root, dirs, files in os.walk(repo_dir):
            # Prune excluded directories in-place
            dirs[:] = [d for d in dirs if d not in cls.EXCLUDED_DIRS and not d.startswith(".")]

            for file_name in sorted(files):
                ext = Path(file_name).suffix.lower()
                if ext in cls.EXCLUDED_EXTENSIONS:
                    continue

                full_path = Path(root) / file_name
                try:
                    size = full_path.stat().st_size
                    if size == 0 or size > cls.MAX_FILE_SIZE_BYTES:
                        continue

                    if cls.is_binary_content(full_path):
                        continue

                    content = full_path.read_text(encoding="utf-8", errors="replace")
                    rel_path = full_path.relative_to(repo_dir).as_posix()
                    lang = chunker.detect_language(rel_path).value
                    line_count = len(content.splitlines())

                    yield DiscoveredFile(
                        relative_path=rel_path,
                        absolute_path=full_path,
                        language=lang,
                        size_bytes=size,
                        line_count=line_count,
                        content=content,
                    )
                except Exception:
                    continue


class SampleRepositoryFactory:
    """Creates realistic bundled sample repositories for immediate demo and evaluation testing."""

    @classmethod
    def create_fastapi_sample(cls, target_dir: Path) -> None:
        """Creates a realistic, complete Python FastAPI codebase with multiple modules."""
        files: Dict[str, str] = {
            "README.md": """# CloudFlow API
High-performance asynchronous microservice for telemetry ingestion, token authentication, and predictive job scheduling.
""",
            "src/config.py": """from pydantic_settings import BaseSettings

class AppSettings(BaseSettings):
    APP_NAME: str = "CloudFlow"
    JWT_SECRET_KEY: str = "super-secret-key-spectracode"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    MAX_CONCURRENT_JOBS: int = 16
    RATE_LIMIT_PER_MINUTE: int = 120

settings = AppSettings()
""",
            "src/auth/jwt_manager.py": """import jwt
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional
from src.config import settings

class JWTAuthenticationError(Exception):
    \"\"\"Raised when token verification fails or expired.\"\"\"
    pass

class TokenManager:
    \"\"\"Manages creation, verification, and claims decoding for JWT bearer tokens.\"\"\"

    def __init__(self, secret_key: Optional[str] = None, algorithm: Optional[str] = None):
        self.secret_key = secret_key or settings.JWT_SECRET_KEY
        self.algorithm = algorithm or settings.JWT_ALGORITHM

    def create_access_token(self, payload: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
        \"\"\"Generates a signed JWT token with expiry timestamp.\"\"\"
        claims = payload.copy()
        expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
        claims.update({"exp": expire, "iat": datetime.now(timezone.utc)})
        return jwt.encode(claims, self.secret_key, algorithm=self.algorithm)

    def verify_token(self, token: str) -> Dict[str, Any]:
        \"\"\"Decodes and validates JWT claims. Raises JWTAuthenticationError on failure.\"\"\"
        try:
            decoded = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            return decoded
        except jwt.ExpiredSignatureError:
            raise JWTAuthenticationError("Access token signature has expired.")
        except jwt.InvalidTokenError as err:
            raise JWTAuthenticationError(f"Invalid token signature: {err}")
""",
            "src/models/user.py": """from dataclasses import dataclass
from typing import Optional, List
from enum import Enum

class UserRole(str, Enum):
    ADMIN = "admin"
    DEVELOPER = "developer"
    VIEWER = "viewer"

@dataclass
class UserRecord:
    \"\"\"User entity representing an authenticated platform user.\"\"\"
    user_id: str
    email: str
    role: UserRole
    is_active: bool = True
    assigned_namespaces: List[str] = None

    def has_admin_access(self) -> bool:
        \"\"\"Determines whether user has administrative privileges.\"\"\"
        return self.is_active and self.role == UserRole.ADMIN
""",
            "src/services/job_scheduler.py": """import asyncio
from typing import Dict, List, Any
from src.config import settings

class JobExecutionError(Exception):
    pass

class DistributedScheduler:
    \"\"\"Orchestrates background tasks across worker pools with exponential backoff.\"\"\"

    def __init__(self, max_concurrency: int = 10):
        self.max_concurrency = max_concurrency
        self.active_jobs: Dict[str, Dict[str, Any]] = {}
        self._semaphore = asyncio.Semaphore(max_concurrency)

    async def schedule_job(self, job_id: str, task_name: str, payload: Dict[str, Any]) -> str:
        \"\"\"Enqueues a new background task if under concurrency quota.\"\"\"
        if len(self.active_jobs) >= settings.MAX_CONCURRENT_JOBS:
            raise JobExecutionError("Concurrency threshold exceeded. Please retry later.")
        
        self.active_jobs[job_id] = {
            "task_name": task_name,
            "status": "queued",
            "retries": 0,
            "payload": payload
        }
        return job_id

    async def execute_with_retry(self, job_id: str, max_retries: int = 3) -> bool:
        \"\"\"Executes queued job with retry mechanism and exponential backoff delay.\"\"\"
        job = self.active_jobs.get(job_id)
        if not job:
            return False

        for attempt in range(1, max_retries + 1):
            try:
                async with self._semaphore:
                    job["status"] = "running"
                    # Simulated computation
                    await asyncio.sleep(0.01)
                    job["status"] = "completed"
                    return True
            except Exception as exc:
                job["retries"] = attempt
                if attempt == max_retries:
                    job["status"] = "failed"
                    raise JobExecutionError(f"Job {job_id} failed after {max_retries} attempts: {exc}")
                await asyncio.sleep(0.1 * (2 ** attempt))
        return False
""",
            "src/api/routes.py": """from fastapi import APIRouter, Header, HTTPException, status
from src.auth.jwt_manager import TokenManager, JWTAuthenticationError
from src.services.job_scheduler import DistributedScheduler

router = APIRouter(prefix="/v1")
token_mgr = TokenManager()
scheduler = DistributedScheduler()

def get_current_user_claims(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Malformed Bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        return token_mgr.verify_token(token)
    except JWTAuthenticationError as err:
        raise HTTPException(status_code=401, detail=str(err))

@router.post("/jobs/schedule")
async def trigger_schedule(job_id: str, task: str):
    return {"status": "enqueued", "job_id": job_id}
""",
        }

        target_dir.mkdir(parents=True, exist_ok=True)
        for rel_path, code in files.items():
            p = target_dir / rel_path
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(code, encoding="utf-8")
