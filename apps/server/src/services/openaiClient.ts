// Canonical singleton — re-exports from lib/openai.
// All subdirectory services that import openaiClient get the shared singleton with
// retry (maxRetries=3), timeout (30s), and tracing built in.
export { openai, tracedCompletion } from '../lib/openai';
