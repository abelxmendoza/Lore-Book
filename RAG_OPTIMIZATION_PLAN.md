# RAG Optimization Plan for Lorekeeper

## Current State Analysis

### Strengths
- ✅ Comprehensive RAG packet with all lore knowledge
- ✅ Embedding caching to reduce API costs
- ✅ Semantic search with vector similarity
- ✅ Confidence-weighted retrieval
- ✅ Recency boosting
- ✅ HQI engine combining graph + semantic search
- ✅ RAG packet caching (5-minute TTL)

### Areas for Improvement

1. **Query Understanding & Rewriting**
   - No query expansion or rewriting
   - Missing query intent classification for retrieval
   - No query decomposition for complex questions

2. **Hybrid Search**
   - Basic hybrid search exists but could be enhanced
   - Keyword search could use better tokenization
   - Missing BM25 or better keyword matching

3. **Reranking**
   - Basic reranking exists but could use cross-encoder models
   - No learning-to-rank from user feedback

4. **Context Management**
   - No context compression before sending to LLM
   - Fixed context window - could be dynamic
   - No prioritization of retrieved chunks

5. **Chunking Strategy**
   - No mention of chunking for long documents
   - Could use semantic chunking vs fixed-size

6. **Multi-Vector Retrieval**
   - Only using single embedding per document
   - Could use multiple embeddings (title, content, summary)

7. **Temporal Context**
   - Basic recency weighting but could be more sophisticated
   - Missing temporal decay functions

8. **Entity-Aware Retrieval**
   - Some entity confidence but could be enhanced
   - Missing entity relationship boosting

9. **Feedback Loop**
   - No learning from user feedback
   - No A/B testing for retrieval strategies

10. **Index Optimization**
    - Using IVFFlat (good for speed) but could use HNSW for accuracy
    - Missing specialized indexes for different query types

## Optimization Recommendations

### Priority 1: High Impact, Low Effort

#### 1.1 Query Rewriting & Expansion
**Impact**: High - Improves retrieval relevance significantly
**Effort**: Medium

```typescript
// New service: queryRewriter.ts
class QueryRewriter {
  async rewriteQuery(originalQuery: string, conversationHistory: any[]): Promise<{
    expanded: string[];
    intent: 'factual' | 'temporal' | 'relational' | 'analytical';
    entities: string[];
  }> {
    // Use LLM to:
    // 1. Expand query with synonyms and related terms
    // 2. Extract entities mentioned
    // 3. Classify intent
    // 4. Generate alternative phrasings
  }
}
```

**Benefits**:
- Handles synonyms and related terms
- Better entity extraction for retrieval
- Intent-aware retrieval routing

#### 1.2 Enhanced Hybrid Search
**Impact**: High - Combines best of keyword + semantic
**Effort**: Medium

```typescript
// Enhance memoryRetriever.ts
async hybridSearch(userId: string, query: string, limit: number) {
  // 1. Semantic search (existing)
  const semanticResults = await this.semanticSearch(query, limit * 2);
  
  // 2. BM25 keyword search (new)
  const keywordResults = await this.bm25Search(query, limit * 2);
  
  // 3. Entity-aware search (new)
  const entityResults = await this.entitySearch(query, limit);
  
  // 4. Reciprocal Rank Fusion (RRF)
  const combined = this.reciprocalRankFusion([
    semanticResults,
    keywordResults,
    entityResults
  ]);
  
  return combined.slice(0, limit);
}
```

**Benefits**:
- Better handling of exact matches (keyword)
- Better handling of semantic similarity (vector)
- Combines strengths of both approaches

#### 1.3 Context Compression
**Impact**: High - Reduces token usage, improves relevance
**Effort**: Medium

```typescript
// New service: contextCompressor.ts
class ContextCompressor {
  async compressContext(
    retrievedChunks: MemoryEntry[],
    query: string,
    maxTokens: number
  ): Promise<CompressedContext> {
    // Use LLM to:
    // 1. Extract only relevant information
    // 2. Summarize redundant information
    // 3. Prioritize query-relevant details
    // 4. Maintain entity relationships
  }
}
```

**Benefits**:
- Reduces token costs
- Improves signal-to-noise ratio
- Allows more relevant context in same window

### Priority 2: High Impact, Medium Effort

#### 2.1 Cross-Encoder Reranking
**Impact**: High - Significantly improves ranking quality
**Effort**: Medium-High

```typescript
// New service: reranker.ts
class Reranker {
  async rerank(
    query: string,
    candidates: MemoryEntry[],
    topK: number = 10
  ): Promise<MemoryEntry[]> {
    // Use cross-encoder model (e.g., ms-marco-MiniLM)
    // More accurate than bi-encoder for ranking
    // Trade-off: slower but more accurate
  }
}
```

**Benefits**:
- Much better ranking than cosine similarity alone
- Can fine-tune on user feedback
- Improves top-K quality significantly

#### 2.2 Multi-Vector Retrieval
**Impact**: Medium-High - Better coverage of document content
**Effort**: Medium

```typescript
// Enhance embedding generation
async generateMultiEmbeddings(entry: MemoryEntry) {
  return {
    title: await embedText(entry.title || entry.summary?.substring(0, 100)),
    content: await embedText(entry.content),
    summary: await embedText(entry.summary || ''),
    entities: await embedText(entry.entities?.join(', ') || ''),
    // Use max pooling or weighted combination
  };
}
```

**Benefits**:
- Better retrieval for title-only queries
- Better retrieval for entity-focused queries
- More comprehensive document representation

#### 2.3 Semantic Chunking
**Impact**: Medium-High - Better chunk boundaries
**Effort**: Medium

```typescript
// New service: semanticChunker.ts
class SemanticChunker {
  async chunkDocument(
    content: string,
    maxChunkSize: number = 500,
    overlap: number = 50
  ): Promise<Chunk[]> {
    // Use sentence embeddings to find natural boundaries
    // Chunk at semantic boundaries, not just token count
    // Maintain entity coherence within chunks
  }
}
```

**Benefits**:
- Better chunk quality
- Preserves semantic coherence
- Reduces information loss at boundaries

### Priority 3: Medium Impact, Variable Effort

#### 3.1 Advanced Temporal Weighting
**Impact**: Medium - Better recency handling
**Effort**: Low-Medium

```typescript
// Enhance memoryRetriever.ts
private temporalWeight(date: Date, queryType: 'recent' | 'historical' | 'all'): number {
  const daysAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  
  switch (queryType) {
    case 'recent':
      return Math.exp(-daysAgo / 30); // Exponential decay
    case 'historical':
      return 1 / (1 + daysAgo / 365); // Inverse decay
    case 'all':
      return 1 / (1 + daysAgo / 90); // Moderate decay
  }
}
```

**Benefits**:
- Better handling of time-sensitive queries
- More nuanced recency weighting

#### 3.2 Entity Relationship Boosting
**Impact**: Medium - Better entity-aware retrieval
**Effort**: Medium

```typescript
// Enhance retrieval with entity graph
async entityBoostedRetrieval(
  query: string,
  entities: string[],
  userId: string
): Promise<MemoryEntry[]> {
  // Boost entries that:
  // 1. Mention query entities
  // 2. Mention entities related to query entities (via graph)
  // 3. Have high entity confidence
}
```

**Benefits**:
- Better retrieval for entity-focused queries
- Leverages entity relationship graph

#### 3.3 Query Intent Routing
**Impact**: Medium - Optimized retrieval per intent
**Effort**: Medium

```typescript
// New service: intentRouter.ts
class IntentRouter {
  async routeQuery(query: string): Promise<RetrievalStrategy> {
    const intent = await this.classifyIntent(query);
    
    switch (intent) {
      case 'factual':
        return { method: 'hybrid', weights: { semantic: 0.7, keyword: 0.3 } };
      case 'temporal':
        return { method: 'temporal', recencyWeight: 0.8 };
      case 'relational':
        return { method: 'entity', entityBoost: 1.5 };
      case 'analytical':
        return { method: 'semantic', limit: 50 }; // More context
    }
  }
}
```

**Benefits**:
- Optimized retrieval per query type
- Better results for different question types

### Priority 4: Long-term Improvements

#### 4.1 Learning-to-Rank from Feedback
**Impact**: High - Continuous improvement
**Effort**: High

- Collect user feedback on retrieved results
- Train ranking model on feedback
- A/B test different retrieval strategies

#### 4.2 HNSW Index Migration
**Impact**: Medium - Better accuracy
**Effort**: Medium

- Migrate from IVFFlat to HNSW for better accuracy
- Trade-off: slightly slower but more accurate
- Better for high-dimensional vectors

#### 4.3 Query Decomposition
**Impact**: Medium - Better complex query handling
**Effort**: High

- Decompose complex queries into sub-queries
- Retrieve for each sub-query
- Combine results intelligently

#### 4.4 Specialized Indexes
**Impact**: Medium - Faster specialized queries
**Effort**: Medium

- Entity index for entity queries
- Temporal index for time-based queries
- Relationship index for relational queries

## Implementation Roadmap

### Phase 1 (Weeks 1-2): Quick Wins
1. ✅ Query rewriting & expansion
2. ✅ Enhanced hybrid search with BM25
3. ✅ Context compression

### Phase 2 (Weeks 3-4): Core Improvements
1. ✅ Cross-encoder reranking
2. ✅ Multi-vector retrieval
3. ✅ Semantic chunking

### Phase 3 (Weeks 5-6): Advanced Features
1. ✅ Advanced temporal weighting
2. ✅ Entity relationship boosting
3. ✅ Query intent routing

### Phase 4 (Ongoing): Long-term
1. Learning-to-rank from feedback
2. HNSW index migration
3. Query decomposition
4. Specialized indexes

## Metrics to Track

1. **Retrieval Quality**
   - Precision@K (top-K relevance)
   - Recall@K
   - NDCG (Normalized Discounted Cumulative Gain)

2. **Performance**
   - Retrieval latency
   - Token usage (before/after compression)
   - Cache hit rate

3. **User Experience**
   - Response relevance (user feedback)
   - Response accuracy
   - User satisfaction scores

4. **Cost**
   - Embedding API calls
   - LLM token usage
   - Storage costs

## Expected Improvements

- **Retrieval Quality**: +30-50% improvement in precision@10
- **Token Efficiency**: -40-60% reduction in context tokens
- **Response Quality**: +20-30% improvement in user satisfaction
- **Cost**: -20-30% reduction in API costs (from better caching + compression)
