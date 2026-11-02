# RepoLens Code-Aware RAG Pipeline

Standard text Retrieval-Augmented Generation (RAG) fails on codebases because:
1. Fixed-size character or token splitters cut across function signatures, indentations, and class scopes.
2. Code identifiers (`getUserById`, `verify_jwt`) fail generic English stemmers.
3. LLMs hallucinate file paths and line numbers when generating technical explanations.

RepoLens solves each of these challenges systematically.

---

## 1. Syntax-Aware Document Chunking

```
Raw Source Code 
       │
       ▼ (Tree-sitter CST Generator)
Concrete Syntax Tree (CST)
       │
       ▼ (Scope-Aware Boundary Grouping)
AST Node Windows [start_line, end_line]
       │
       ▼ (Context Injection)
Contextualized Chunk: [Metadata Header + Raw Code]
```

- **Decorator & Docstring Attachment**: Class decorators (e.g. `@app.post`, `@dataclass`) and module docstrings are bound to the node interval, preventing orphaned signatures.
- **Statement Windowing with Overlap**: Large functions or classes exceeding `MAX_CHUNK_CHARS = 3000` are decomposed into statement sub-ranges with a 4-line overlap, preserving exact 1-indexed line continuity.
- **Gap Filling**: Code outside formal AST declarations (module constants, top-level scripts) is grouped into `<module_scope>` chunks so no repository code is missed.

---

## 2. Hybrid Retrieval with Reciprocal Rank Fusion (RRF)

### 2.1 Sub-Token Lexical Expansion
Before lexical matching, code identifiers are decomposed:
$$\text{Expand}(\texttt{TokenManager.verify\_token}) \longrightarrow \{\texttt{tokenmanager}, \texttt{token}, \texttt{manager}, \texttt{verify\_token}, \texttt{verify}\}$$

### 2.2 Dual Retrieval Strategy
For a user query $q$:
1. **Dense Vector Search**: Computes cosine similarity against 384-d `BAAI/bge-small-en-v1.5` embeddings across all repository chunks.
2. **Sparse Lexical Search**: Matches query terms against expanded token sets and file path paths.

### 2.3 Rank Merging
$$\text{RRF Score}(d) = \alpha \cdot \frac{1}{60 + \text{rank}_{\text{dense}}(d)} + (1 - \alpha) \cdot \frac{1}{60 + \text{rank}_{\text{sparse}}(d)}$$

| Query Characteristic | Dynamic $\alpha$ | Rationale |
| :--- | :---: | :--- |
| **Conceptual** (*"How does auth work?"*) | $0.55$ | Prioritizes semantic understanding |
| **Identifier / Path** (*"`verify_token` in jwt"*) | $0.35$ | Prioritizes exact lexical hits |

---

## 3. Grounded Citation Verification

RepoLens enforces deterministic verification before presenting citations to users:

```
Streaming Token: "[src/auth/jwt_manager.py:12-35]"
                        │
                        ▼ (Regex Parser)
Target File: "src/auth/jwt_manager.py", Lines: [12, 35]
                        │
                        ▼ (Retrieved Chunk Boundary Check)
   Does [12, 35] lie within retrieved chunk bounds for that file?
                        │
        ┌───────────────┴───────────────┐
        ▼ (YES)                         ▼ (NO)
  [EXACT_MATCH]             Does it overlap a retrieved chunk?
  Emitted to client                 ┌───┴───┐
                                    ▼ (YES) ▼ (NO)
                           [CLAMPED_TO_BOUNDS] [REJECTED]
                             Snaps to overlap   Stripped from text
```

If an LLM produces an answer with zero verified citations or retrieved relevance is below threshold, the system triggers `INSUFFICIENT_REPOSITORY_CONTEXT`.
