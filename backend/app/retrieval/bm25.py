"""Okapi BM25 over code chunks: the plain keyword baseline the hybrid retriever must beat.

Deliberately simple and dependency-free. Tokenisation reuses the project's code-aware
normaliser (snake_case / camelCase splitting), so the baseline is not handicapped by
treating `get_netrc_auth` as one opaque word.
"""
from __future__ import annotations

import math
from collections import Counter
from typing import Dict, List, Sequence, Tuple

from app.ingestion.ast_chunker import CodeQueryNormalizer


def tokenize(text: str) -> List[str]:
    return CodeQueryNormalizer.expand_code_text(text).split()


class BM25Index:
    def __init__(self, documents: Sequence[str], k1: float = 1.5, b: float = 0.75) -> None:
        self.k1 = k1
        self.b = b
        self._term_freqs: List[Counter[str]] = [Counter(tokenize(doc)) for doc in documents]
        self._lengths = [sum(tf.values()) for tf in self._term_freqs]
        self._avg_len = (sum(self._lengths) / len(self._lengths)) if self._lengths else 0.0
        doc_freq: Dict[str, int] = Counter()
        for tf in self._term_freqs:
            doc_freq.update(tf.keys())
        n = len(self._term_freqs)
        # BM25+ style floor (the +1 inside the log) keeps IDF positive for very common terms.
        self._idf = {t: math.log(1 + (n - df + 0.5) / (df + 0.5)) for t, df in doc_freq.items()}

    def score(self, query: str) -> List[float]:
        terms = [t for t in set(tokenize(query)) if t in self._idf]
        scores: List[float] = []
        for tf, length in zip(self._term_freqs, self._lengths, strict=True):
            norm = self.k1 * (1 - self.b + self.b * (length / self._avg_len)) if self._avg_len else self.k1
            s = 0.0
            for t in terms:
                f = tf.get(t, 0)
                if f:
                    s += self._idf[t] * (f * (self.k1 + 1)) / (f + norm)
            scores.append(s)
        return scores

    def rank(self, query: str, top_k: int) -> List[Tuple[int, float]]:
        """Returns (document_index, score) pairs, best first; zero-score documents are dropped."""
        scored = [(i, s) for i, s in enumerate(self.score(query)) if s > 0]
        scored.sort(key=lambda pair: pair[1], reverse=True)
        return scored[:top_k]
