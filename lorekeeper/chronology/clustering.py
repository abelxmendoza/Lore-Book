"""HDBSCAN clustering for temporal events."""
from typing import Dict, List, Any
import numpy as np

try:
    import hdbscan
    HDBSCAN_AVAILABLE = True
except ImportError:
    HDBSCAN_AVAILABLE = False


def cluster_events(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Cluster events using HDBSCAN based on embeddings.
    """
    if not events or not HDBSCAN_AVAILABLE:
        return {"labels": []}

    try:
        # Extract embeddings
        embeddings = []
        valid_indices = []
        
        for i, event in enumerate(events):
            embedding = event.get("embedding")
            if embedding and isinstance(embedding, list) and len(embedding) > 0:
                embeddings.append(embedding)
                valid_indices.append(i)

        if len(embeddings) < 3:
            # Not enough events for clustering
            return {"labels": [-1] * len(events)}

        # Convert to numpy array
        X = np.array(embeddings)

        # Run HDBSCAN
        clusterer = hdbscan.HDBSCAN(min_cluster_size=3, min_samples=2)
        labels = clusterer.fit_predict(X)

        # Map labels back to original event indices
        full_labels = [-1] * len(events)
        for idx, label in zip(valid_indices, labels):
            full_labels[idx] = int(label)

        return {
            "labels": full_labels,
            "metadata": {
                "cluster_count": len(set(labels)) - (1 if -1 in labels else 0),
                "noise_count": int(np.sum(labels == -1)),
            },
        }
    except Exception as e:
        # Return empty labels on failure
        return {"labels": [-1] * len(events), "error": str(e)}

