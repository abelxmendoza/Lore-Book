/**
 * ModelRouter — capability → provider/model → completion/embedding
 * with OpenAI fallback so missing local servers never break the app.
 */

import { logger } from '../../logger';
import {
  describeModelRouterConfig,
  resolveOpenaiFallbackModel,
  resolveRoute,
} from './modelRouterConfig';
import { buildProviderRegistry, logProviderInit } from './providers';
import type {
  ChatCompletionParams,
  EmbeddingParams,
  LlmCallMeta,
  LlmCapability,
  LlmChatResult,
  LlmEmbeddingResult,
  LlmProvider,
  LlmProviderId,
  LlmRoute,
} from './types';

export class ModelRouter {
  private providers: Map<LlmProviderId, LlmProvider>;
  private initialized = false;

  constructor(providers?: Map<LlmProviderId, LlmProvider>) {
    this.providers = providers ?? buildProviderRegistry();
  }

  /** Lazy one-time log so importing the module is side-effect free in tests. */
  private ensureInit(): void {
    if (this.initialized) return;
    this.initialized = true;
    try {
      logProviderInit(this.providers);
    } catch {
      /* ignore */
    }
  }

  /** Resolve route for a capability (config only — no network). */
  resolve(capability: LlmCapability): LlmRoute {
    return resolveRoute(capability);
  }

  /** Snapshot of all capability routes (for /health or admin diagnostics). */
  describe(): Record<string, LlmRoute> {
    return describeModelRouterConfig();
  }

  getProvider(id: LlmProviderId): LlmProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Chat completion for a capability.
   * Falls back to OpenAI when the primary provider fails and fallback is enabled.
   */
  async chatCompletion(
    capability: LlmCapability,
    params: ChatCompletionParams,
  ): Promise<{ result: LlmChatResult; meta: LlmCallMeta }> {
    this.ensureInit();
    const route = this.resolve(capability);
    const start = Date.now();

    const tryProvider = async (r: LlmRoute): Promise<LlmChatResult> => {
      const provider = this.providers.get(r.provider);
      if (!provider) {
        throw new Error(`Unknown LLM provider: ${r.provider}`);
      }
      if (r.provider !== 'openai' && !provider.isAvailable()) {
        throw new Error(`Provider ${r.provider} is not available`);
      }
      if (r.provider === 'openai' && !provider.isAvailable()) {
        throw new Error('OpenAI API key is not configured (OPENAI_API_KEY)');
      }
      const body = { ...params, model: params.model || r.model };
      return provider.chatCompletion(body, r);
    };

    try {
      const result = await tryProvider(route);
      const meta: LlmCallMeta = {
        capability,
        provider: route.provider,
        model: (result.model as string) || route.model,
        usedFallback: false,
        durationMs: Date.now() - start,
      };
      logger.debug(meta, 'llm.chat.ok');
      return { result, meta };
    } catch (primaryErr) {
      if (!route.fallbackToOpenai || route.provider === 'openai') {
        logger.warn(
          { err: primaryErr, capability, provider: route.provider, model: route.model },
          'llm.chat.failed',
        );
        throw primaryErr;
      }

      logger.warn(
        {
          err: primaryErr instanceof Error ? primaryErr.message : String(primaryErr),
          capability,
          provider: route.provider,
          model: route.model,
        },
        'llm.chat.primary_failed_falling_back_to_openai',
      );

      const forcedOpenai: LlmRoute = {
        capability,
        provider: 'openai',
        model: resolveOpenaiFallbackModel(capability, params.model),
        fallbackToOpenai: false,
      };

      try {
        const result = await tryProvider(forcedOpenai);
        const meta: LlmCallMeta = {
          capability,
          provider: 'openai',
          model: (result.model as string) || forcedOpenai.model,
          usedFallback: true,
          durationMs: Date.now() - start,
        };
        logger.info(meta, 'llm.chat.fallback_ok');
        return { result, meta };
      } catch (fallbackErr) {
        logger.error(
          {
            primaryErr: primaryErr instanceof Error ? primaryErr.message : String(primaryErr),
            fallbackErr: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
            capability,
          },
          'llm.chat.fallback_failed',
        );
        // Surface the primary failure (what the app was trying to use);
        // fallback details are in logs.
        throw primaryErr;
      }
    }
  }

  /**
   * Embeddings for a capability (usually 'embedding').
   * Falls back to OpenAI on local failure when enabled.
   */
  async embeddings(
    capability: LlmCapability,
    params: EmbeddingParams,
  ): Promise<{ result: LlmEmbeddingResult; meta: LlmCallMeta }> {
    this.ensureInit();
    const route = this.resolve(capability === 'default' ? 'embedding' : capability);
    const start = Date.now();

    const tryProvider = async (r: LlmRoute): Promise<LlmEmbeddingResult> => {
      const provider = this.providers.get(r.provider);
      if (!provider?.embeddings) {
        throw new Error(`Provider ${r.provider} does not support embeddings`);
      }
      if (r.provider === 'openai' && !provider.isAvailable()) {
        throw new Error('OpenAI API key is not configured (OPENAI_API_KEY)');
      }
      return provider.embeddings({ ...params, model: params.model || r.model }, r);
    };

    try {
      const result = await tryProvider(route);
      const meta: LlmCallMeta = {
        capability: route.capability,
        provider: route.provider,
        model: (result.model as string) || route.model,
        usedFallback: false,
        durationMs: Date.now() - start,
      };
      logger.debug(meta, 'llm.embed.ok');
      return { result, meta };
    } catch (primaryErr) {
      if (!route.fallbackToOpenai || route.provider === 'openai') {
        logger.warn(
          { err: primaryErr, capability, provider: route.provider, model: route.model },
          'llm.embed.failed',
        );
        throw primaryErr;
      }

      logger.warn(
        {
          err: primaryErr instanceof Error ? primaryErr.message : String(primaryErr),
          capability,
          provider: route.provider,
        },
        'llm.embed.primary_failed_falling_back_to_openai',
      );

      const forcedOpenai: LlmRoute = {
        capability: 'embedding',
        provider: 'openai',
        model: resolveOpenaiFallbackModel('embedding', params.model),
        fallbackToOpenai: false,
      };

      try {
        const result = await tryProvider(forcedOpenai);
        const meta: LlmCallMeta = {
          capability: 'embedding',
          provider: 'openai',
          model: (result.model as string) || forcedOpenai.model,
          usedFallback: true,
          durationMs: Date.now() - start,
        };
        logger.info(meta, 'llm.embed.fallback_ok');
        return { result, meta };
      } catch (fallbackErr) {
        logger.error(
          {
            primaryErr: primaryErr instanceof Error ? primaryErr.message : String(primaryErr),
            fallbackErr: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
          },
          'llm.embed.fallback_failed',
        );
        throw primaryErr;
      }
    }
  }
}

/** Process-wide singleton */
let _router: ModelRouter | undefined;

export function getModelRouter(): ModelRouter {
  if (!_router) _router = new ModelRouter();
  return _router;
}

/** Test-only reset */
export function resetModelRouterForTests(router?: ModelRouter): void {
  _router = router;
}
