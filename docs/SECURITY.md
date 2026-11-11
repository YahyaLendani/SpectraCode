# SpectraCode Security & Untrusted Input Policy

## 1. Threat Model

SpectraCode indexes source code from arbitrary public GitHub repositories. Ingesting arbitrary codebases introduces critical security risks:
- Malicious repository configurations attempting remote code execution (RCE) via `setup.py`, npm post-install scripts, or git hooks.
- Path traversal attacks via crafted directory structures or symlinks (`../../etc/passwd`).
- Resource exhaustion (Zip bombs, deeply nested directory recursion, multi-gigabyte binary files).

SpectraCode enforces strict security controls at every phase.

---

## 2. Ingestion Sandboxing & Execution Invariants

1. **Zero Execution Policy**:
   - Repository code is **NEVER executed, compiled, evaluated, or imported as a Python module**.
   - Tree-sitter performs purely static Concrete Syntax Tree (CST) analysis via native C-bindings without invoking user runtimes.
2. **Read-Only Clones**:
   - Repositories are cloned with `--depth 1 --single-branch` into dedicated ephemeral directories isolated by unique UUIDs (`app/data/repos/{owner}_{name}_{uuid}`).
   - Git hooks are disabled during checkout.
3. **MIME & Binary Inspection**:
   - Files are screened by extension and inspected for null bytes (`\x00`) in the first 8 KB.
   - Any binary blob, compiled artifact (`.pyc`, `.dll`, `.so`, `.exe`), or media file is rejected.
4. **File Size & Token Limits**:
   - Hard cap of 1 MB per file (`MAX_FILE_SIZE_BYTES = 1048576`).
   - Repository file traversal automatically ignores vendor directories (`node_modules/`, `.git/`, `.venv/`, `vendor/`, `dist/`).
5. **Path Normalization**:
   - All relative file paths are sanitized to prevent directory traversal outside the repository sandbox.

