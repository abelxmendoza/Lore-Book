# Future Features

This document tracks planned features that are not yet implemented but are part of the roadmap.

## Model Fine-Tuning

**Status**: Planned for future implementation

**Description**: Fine-tune models on user-specific data to improve accuracy for entity extraction, sentiment analysis, and relationship detection.

**Current State**:
- Training data collection infrastructure exists (`trainingDataCollector.ts`)
- User corrections are tracked and stored
- Model fine-tuning service structure exists but is not implemented

**Why Not Implemented Yet**:
- Requires ML infrastructure (Hugging Face, AWS SageMaker, or local transformers)
- Needs model storage and versioning system
- Requires deployment pipeline
- Needs evaluation metrics and monitoring
- Cost considerations (fine-tuning can be expensive)

**Implementation Plan** (Future):
1. Choose ML infrastructure (recommended: OpenAI Fine-tuning API for simplicity, or transformers.js for local)
2. Implement model training pipeline
3. Add model storage and versioning
4. Create deployment system
5. Add evaluation metrics
6. Integrate with existing extraction services

**Related Files**:
- `apps/server/src/services/activeLearning/modelFineTuner.ts` - Placeholder implementation
- `apps/server/src/services/activeLearning/trainingDataCollector.ts` - Data collection (working)
- `apps/server/src/services/activeLearning/correctionTracker.ts` - Correction tracking (working)

**Training Data**:
- Collected automatically from user corrections
- Stored in `training_datasets` table
- Ready for use when fine-tuning is implemented
