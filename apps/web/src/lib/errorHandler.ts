/**
 * Centralized Error Handling
 * 
 * Provides consistent error handling, user-friendly error messages,
 * and error reporting throughout the application.
 */

import { errorTracking } from './monitoring';
import { config } from '../config/env';

export type ErrorCategory = 
  | 'network'
  | 'authentication'
  | 'authorization'
  | 'validation'
  | 'server'
  | 'client'
  | 'unknown';

export interface AppError extends Error {
  category: ErrorCategory;
  code?: string;
  statusCode?: number;
  userMessage?: string;
  retryable?: boolean;
  context?: Record<string, any>;
}

/**
 * Create a structured application error
 */
export function createAppError(
  message: string,
  category: ErrorCategory = 'unknown',
  options?: {
    code?: string;
    statusCode?: number;
    userMessage?: string;
    retryable?: boolean;
    context?: Record<string, any>;
    originalError?: Error;
  }
): AppError {
  const error = new Error(message) as AppError;
  error.category = category;
  error.code = options?.code;
  error.statusCode = options?.statusCode;
  error.userMessage = options?.userMessage || message;
  error.retryable = options?.retryable ?? false;
  error.context = options?.context;
  
  if (options?.originalError) {
    error.stack = options.originalError.stack;
    error.cause = options.originalError;
  }
  
  return error;
}

/**
 * Get user-friendly error message
 */
export function getUserFriendlyMessage(error: unknown): string {
  if (error instanceof Error) {
    const appError = error as AppError;
    
    // Use custom user message if available
    if (appError.userMessage) {
      return appError.userMessage;
    }
    
    // Map error categories to user-friendly messages
    switch (appError.category) {
      case 'network':
        return 'Unable to connect to the server. Please check your internet connection and try again.';
      case 'authentication':
        return 'Your session has expired. Please sign in again.';
      case 'authorization':
        return 'You don\'t have permission to perform this action.';
      case 'validation':
        return 'Please check your input and try again.';
      case 'server':
        return 'Something went wrong on our end. Please try again later.';
      case 'client':
        return 'An error occurred. Please refresh the page and try again.';
      default:
        return error.message || 'An unexpected error occurred.';
    }
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  return 'An unexpected error occurred. Please try again.';
}

/**
 * Handle and report error
 */
export function handleError(
  error: unknown,
  context?: {
    component?: string;
    action?: string;
    userId?: string;
    metadata?: Record<string, any>;
  }
): AppError {
  let appError: AppError;
  
  if (error instanceof Error) {
    appError = error as AppError;
    
    // If it's not already an AppError, convert it
    if (!appError.category) {
      appError = createAppError(
        error.message,
        categorizeError(error),
        {
          originalError: error,
          context: context?.metadata,
        }
      );
    }
  } else {
    appError = createAppError(
      'An unknown error occurred',
      'unknown',
      { context: context?.metadata }
    );
  }
  
  // Add context
  if (context) {
    appError.context = {
      ...appError.context,
      component: context.component,
      action: context.action,
      userId: context.userId,
      ...context.metadata,
    };
  }
  
  // Report to error tracking
  if (config.prod.enableErrorTracking) {
    errorTracking.captureException(appError, {
      tags: {
        category: appError.category,
        code: appError.code,
        component: context?.component,
        action: context?.action,
      },
      extra: appError.context,
    });
  }
  
  // Log in development
  if (config.isDevelopment && config.dev.verboseErrors) {
    console.error('[Error Handler]', {
      error: appError,
      category: appError.category,
      context: appError.context,
    });
  }
  
  return appError;
}

/**
 * Categorize error based on error message or properties
 */
function categorizeError(error: Error): ErrorCategory {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();
  
  // Network errors
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('connection') ||
    message.includes('timeout') ||
    name === 'networkerror' ||
    name === 'typeerror'
  ) {
    return 'network';
  }
  
  // Authentication errors
  if (
    message.includes('unauthorized') ||
    message.includes('authentication') ||
    message.includes('session') ||
    message.includes('token') ||
    name === 'autherror'
  ) {
    return 'authentication';
  }
  
  // Authorization errors
  if (
    message.includes('forbidden') ||
    message.includes('permission') ||
    message.includes('access denied') ||
    name === 'authorizationerror'
  ) {
    return 'authorization';
  }
  
  // Validation errors
  if (
    message.includes('validation') ||
    message.includes('invalid') ||
    message.includes('required') ||
    name === 'validationerror'
  ) {
    return 'validation';
  }
  
  // Server errors (5xx)
  if (
    message.includes('server error') ||
    message.includes('internal server') ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503')
  ) {
    return 'server';
  }
  
  // Client errors (4xx)
  if (
    message.includes('bad request') ||
    message.includes('not found') ||
    message.includes('400') ||
    message.includes('404')
  ) {
    return 'client';
  }
  
  return 'unknown';
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const appError = error as AppError;
    if (appError.retryable !== undefined) {
      return appError.retryable;
    }
    
    // Default retryable errors
    return (
      appError.category === 'network' ||
      appError.category === 'server' ||
      (appError.statusCode && appError.statusCode >= 500)
    );
  }
  
  return false;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
  }
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
  } = options || {};
  
  let lastError: unknown;
  let delay = initialDelay;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry if error is not retryable
      if (!isRetryableError(error)) {
        throw error;
      }
      
      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Increase delay for next retry
      delay = Math.min(delay * backoffFactor, maxDelay);
    }
  }
  
  throw lastError;
}

