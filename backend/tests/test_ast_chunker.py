from app.ingestion.ast_chunker import CodeASTChunker, SupportedLanguage


def test_python_ast_chunker():
    code = '''import os
from typing import List

class AuthService:
    """Handles user authentication."""

    def __init__(self, secret: str):
        self.secret = secret

    def verify_token(self, token: str) -> bool:
        """Verifies JWT token."""
        return len(token) > 5

def helper_function():
    return 42
'''
    chunker = CodeASTChunker()
    symbols, chunks = chunker.parse_and_chunk("src/auth.py", code)

    # Check extracted symbols
    sym_names = {s.name for s in symbols}
    assert "AuthService" in sym_names
    assert "verify_token" in sym_names
    assert "helper_function" in sym_names

    # Check 1-indexed lines
    for sym in symbols:
        assert sym.start_line >= 1
        assert sym.end_line >= sym.start_line

    auth_sym = next(s for s in symbols if s.name == "AuthService")
    assert auth_sym.docstring == "Handles user authentication."
    assert auth_sym.kind == "class"

    # Check chunks have contextual headers and line ranges
    assert len(chunks) >= 1
    for chunk in chunks:
        assert chunk.start_line >= 1
        assert chunk.end_line >= chunk.start_line
        assert "# [SpectraCode AST Context]" in chunk.contextualized_text
        assert chunk.language == SupportedLanguage.PYTHON.value


def test_typescript_ast_chunker():
    ts_code = """import { Request, Response } from 'express';

/**
 * Interface representing User details
 */
export interface UserDTO {
  id: string;
  name: string;
}

export class UserController {
  private users: UserDTO[] = [];

  public getUser(id: string): UserDTO | undefined {
    return this.users.find(u => u.id === id);
  }
}
"""
    chunker = CodeASTChunker()
    symbols, chunks = chunker.parse_and_chunk("src/controllers/user.ts", ts_code)

    sym_names = {s.name for s in symbols}
    assert "UserDTO" in sym_names
    assert "UserController" in sym_names
    assert "getUser" in sym_names

    user_dto = next(s for s in symbols if s.name == "UserDTO")
    assert user_dto.kind == "interface"
    assert "Interface representing User details" in (user_dto.docstring or "")

    assert len(chunks) >= 1
    for chunk in chunks:
        assert chunk.language == SupportedLanguage.TYPESCRIPT.value
        assert chunk.start_line >= 1
