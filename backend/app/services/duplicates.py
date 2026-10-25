"""Duplicate grievance detection.

Two methods, both explainable:
1. Keyword / full-text matching (baseline, always available).
2. TF-IDF cosine similarity over a corpus of existing grievances — a proxy for
   semantic similarity that works without heavy dependencies. If
   sentence-transformers IS installed and enabled (settings.use_sentence_transformers),
   real sentence embeddings are used instead.

Similarity is blended with category / location / recency / open-status signals.
Nothing is ever auto-rejected or deleted because of similarity — candidates are
only *suggested* and a human reviews them.
"""
import re

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from ..models import Grievance, GrievanceStatus, utcnow

STOPWORDS = set("""a an the and or but if then else of to in on at for from by with without is are was were be been
being it its this that these those i you he she we they them his her their my your our as into about over under
after before during not no yes please kindly request requested complaint grievance issue problem sir madam
""".split())

CLOSED = {GrievanceStatus.closed, GrievanceStatus.rejected}

_st_model = None


def _tokenize(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-z]{3,}", (text or "").lower()) if w not in STOPWORDS]


def _keyword_score(a_tokens: list[str], b_tokens: list[str]) -> tuple[float, list[str]]:
    """Jaccard-style overlap on content words."""
    sa, sb = set(a_tokens), set(b_tokens)
    if not sa or not sb:
        return 0.0, []
    inter = sa & sb
    score = len(inter) / len(sa | sb)
    return round(score, 4), sorted(inter)[:12]


def _tfidf_scores(new_text: str, corpus_texts: list[str]) -> list[float]:
    if not corpus_texts:
        return []
    vec = TfidfVectorizer(stop_words=list(STOPWORDS), ngram_range=(1, 2), min_df=1)
    matrix = vec.fit_transform(corpus_texts + [new_text])
    sims = cosine_similarity(matrix[-1], matrix[:-1])[0]
    return [round(float(s), 4) for s in sims]


def _embedding_scores(new_text: str, corpus_texts: list[str]) -> list[float] | None:
    global _st_model
    try:
        if _st_model is None:
            from sentence_transformers import SentenceTransformer  # optional dep
            _st_model = SentenceTransformer("all-MiniLM-L6-v2")
        emb = _st_model.encode(corpus_texts + [new_text], normalize_embeddings=True)
        return [round(float(emb[-1] @ e), 4) for e in emb[:-1]]
    except Exception:  # noqa: BLE001 - not installed -> caller falls back to TF-IDF
        return None


def find_duplicates(
    new_title: str,
    new_description: str,
    existing: list[Grievance],
    category: str | None = None,
    location: str = "",
    top_k: int = 5,
    use_embeddings: bool = False,
) -> list[dict]:
    """Score `existing` grievances against a new submission; return ranked candidates."""
    if not existing:
        return []
    now = utcnow()
    new_text = f"{new_title}. {new_description}"
    new_tokens = _tokenize(new_text)
    new_loc_tokens = set(_tokenize(location))

    corpus = [f"{g.title}. {g.description}" for g in existing]

    semantic: list[float] | None = None
    sem_method = "tfidf"
    if use_embeddings:
        semantic = _embedding_scores(new_text, corpus)
        sem_method = "embeddings"
    if semantic is None:
        semantic = _tfidf_scores(new_text, corpus)
        sem_method = "tfidf"

    results = []
    for g, sem in zip(existing, semantic):
        kw, matched = _keyword_score(new_tokens, _tokenize(f"{g.title}. {g.description}"))
        score = 0.6 * sem + 0.4 * kw

        # contextual boosts
        boosts = []
        if category and g.category and g.category.name.lower() == category.lower():
            score += 0.05
            boosts.append("same category")
        elif category and g.selected_category and g.selected_category.name.lower() == category.lower():
            score += 0.03
            boosts.append("same selected category")
        g_loc = set(_tokenize(g.location or "")) | set(_tokenize(g.jurisdiction or ""))
        if new_loc_tokens and g_loc and (new_loc_tokens & g_loc):
            score += 0.05
            boosts.append("overlapping location")
        g_submitted = g.submitted_at or now
        if g_submitted.tzinfo is None:
            g_submitted = g_submitted.replace(tzinfo=now.tzinfo)
        age_days = (now - g_submitted).days
        if age_days <= 14:
            score += 0.05
            boosts.append("recent (<14d)")
        elif age_days > 180:
            score -= 0.05
            boosts.append("old (>180d)")
        if g.status not in CLOSED:
            score += 0.05
            boosts.append("still open")

        score = max(0.0, min(1.0, score))
        if score >= 0.35 or sem >= 0.5:
            results.append({
                "grievance": g,
                "score": round(score, 4),
                "semantic_score": sem,
                "keyword_score": kw,
                "method": sem_method,
                "matched_terms": matched,
                "boosts": boosts,
            })

    results.sort(key=lambda r: -r["score"])
    return results[:top_k]


def dedup_evaluation_metrics(pairs: list[tuple[str, str, bool]]) -> dict:
    """Evaluate duplicate detection on a labeled set of (text_a, text_b, is_dup).

    Returns precision / recall / F1 at threshold 0.55 (tunable).
    """
    threshold = 0.55
    tp = fp = fn = tn = 0
    for a, b, label in pairs:
        fake = type("G", (), {"title": b, "description": "", "category": None,
                              "selected_category": None, "location": "", "jurisdiction": "",
                              "status": "in_progress", "submitted_at": utcnow()})()
        out = find_duplicates(a, "", [fake], top_k=1)
        pred = bool(out) and out[0]["score"] >= threshold
        if pred and label:
            tp += 1
        elif pred and not label:
            fp += 1
        elif not pred and label:
            fn += 1
        else:
            tn += 1
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"precision": round(precision, 4), "recall": round(recall, 4),
            "f1": round(f1, 4), "tp": tp, "fp": fp, "fn": fn, "tn": tn, "threshold": threshold}
