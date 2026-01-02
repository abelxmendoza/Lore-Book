/**
 * Mock Data Generators for Admin Console
 * Provides realistic demo data when APIs fail or return empty results
 */

export interface MonthlyFinancial {
  month: string;
  mrr: number;
  revenue: number;
  activeSubscriptions: number;
  newSubscriptions: number;
  churnedSubscriptions: number;
  churnRate: number;
  refunds: number;
}

export interface Subscription {
  id: string;
  userId: string;
  email: string;
  plan: string;
  amount: number;
  renewalDate: string | null;
  status: string;
  ltv: number;
  createdAt: string;
}

export interface PaymentEvent {
  id: string;
  userId: string;
  email: string;
  timestamp: string;
  eventType: string;
  amount: number;
  currency: string;
  status: string;
  invoiceId: string | null;
  metadata: Record<string, any>;
}

export interface FinanceMetrics {
  mrr: number;
  activeSubscriptions: number;
  churnRate: number;
  refundsLast30Days: number;
  totalRevenue: number;
}

/**
 * Generate mock monthly financials data
 */
export function generateMockMonthlyFinancials(months: number = 12): MonthlyFinancial[] {
  const data: MonthlyFinancial[] = [];
  const now = new Date();
  
  let baseMRR = 450;
  let baseSubs = 30;
  
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setMonth(date.getMonth() - i);
    const month = new Date(date.getFullYear(), date.getMonth(), 1);
    
    // Simulate growth trend with some randomness
    const growthFactor = 1 + (Math.random() * 0.15 - 0.05); // -5% to +10% growth
    baseMRR = Math.max(200, baseMRR * growthFactor);
    baseSubs = Math.max(10, Math.round(baseSubs * growthFactor));
    
    // Revenue is typically higher than MRR (includes one-time payments)
    const revenue = baseMRR * (1.1 + Math.random() * 0.2);
    
    // New subscriptions (2-8 per month)
    const newSubs = Math.floor(2 + Math.random() * 6);
    
    // Churned subscriptions (0-3 per month)
    const churned = Math.floor(Math.random() * 3);
    const churnRate = baseSubs > 0 ? (churned / baseSubs) * 100 : 0;
    
    // Refunds (0-2 per month, $0-30)
    const refunds = Math.random() < 0.3 ? Math.random() * 30 : 0;
    
    data.push({
      month: month.toISOString().split('T')[0],
      mrr: Math.round(baseMRR * 100) / 100,
      revenue: Math.round(revenue * 100) / 100,
      activeSubscriptions: baseSubs,
      newSubscriptions: newSubs,
      churnedSubscriptions: churned,
      churnRate: Math.round(churnRate * 100) / 100,
      refunds: Math.round(refunds * 100) / 100,
    });
  }
  
  return data;
}

/**
 * Generate mock subscriptions
 */
export function generateMockSubscriptions(count: number = 10): Subscription[] {
  const subscriptions: Subscription[] = [];
  const domains = ['example.com', 'test.com', 'demo.com', 'sample.org'];
  const names = ['john', 'jane', 'alex', 'maria', 'david', 'sarah', 'mike', 'lisa', 'chris', 'emily'];
  const statuses: Array<'active' | 'trial' | 'canceled' | 'past_due'> = ['active', 'trial', 'canceled', 'past_due'];
  const plans: Array<'free' | 'premium'> = ['free', 'premium'];
  
  for (let i = 0; i < count; i++) {
    const name = names[Math.floor(Math.random() * names.length)];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    const email = `${name}${i > 0 ? i : ''}@${domain}`;
    const plan = plans[Math.floor(Math.random() * plans.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const amount = plan === 'premium' ? 15.0 : 0;
    
    // Generate renewal date (0-30 days from now, or null if canceled)
    const renewalDate = status === 'canceled' 
      ? null 
      : new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString();
    
    // Generate LTV based on months active (rough estimate)
    const monthsActive = Math.floor(Math.random() * 12) + 1;
    const ltv = amount * monthsActive + (Math.random() * 50);
    
    subscriptions.push({
      id: `sub_${i.toString().padStart(8, '0')}`,
      userId: `user_${i.toString().padStart(8, '0')}`,
      email,
      plan,
      amount,
      renewalDate,
      status,
      ltv: Math.round(ltv * 100) / 100,
      createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }
  
  return subscriptions;
}

/**
 * Generate mock payment events
 */
export function generateMockPaymentEvents(count: number = 20): PaymentEvent[] {
  const events: PaymentEvent[] = [];
  const domains = ['example.com', 'test.com', 'demo.com'];
  const names = ['john', 'jane', 'alex', 'maria', 'david', 'sarah'];
  const eventTypes: Array<'payment_succeeded' | 'payment_failed' | 'refund' | 'subscription_created' | 'subscription_deleted'> = [
    'payment_succeeded',
    'payment_succeeded',
    'payment_succeeded', // More successes
    'payment_failed',
    'refund',
    'subscription_created',
    'subscription_deleted',
  ];
  
  for (let i = 0; i < count; i++) {
    const name = names[Math.floor(Math.random() * names.length)];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    const email = `${name}${i > 0 ? i : ''}@${domain}`;
    const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    
    // Determine status based on event type
    let status: string;
    let amount: number;
    
    if (eventType === 'payment_succeeded') {
      status = 'succeeded';
      amount = 15.0 + Math.random() * 5; // $15-20
    } else if (eventType === 'payment_failed') {
      status = 'failed';
      amount = 15.0;
    } else if (eventType === 'refund') {
      status = 'refunded';
      amount = 15.0;
    } else {
      status = 'succeeded';
      amount = 0;
    }
    
    // Generate timestamp (recent events, last 30 days)
    const daysAgo = Math.random() * 30;
    const timestamp = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
    
    // Generate invoice ID (sometimes)
    const invoiceId = eventType === 'payment_succeeded' || eventType === 'payment_failed'
      ? `inv_${Math.random().toString(36).substring(2, 11)}`
      : null;
    
    events.push({
      id: `evt_${i.toString().padStart(8, '0')}`,
      userId: `user_${Math.floor(Math.random() * 10)}`,
      email,
      timestamp,
      eventType,
      amount: Math.round(amount * 100) / 100,
      currency: 'usd',
      status,
      invoiceId,
      metadata: {},
    });
  }
  
  // Sort by timestamp (newest first)
  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/**
 * Generate mock finance metrics
 */
export function generateMockFinanceMetrics(): FinanceMetrics {
  const activeSubs = 35 + Math.floor(Math.random() * 15); // 35-50
  const mrr = activeSubs * 15.0; // $15/month per subscription
  const churnRate = 2.5 + Math.random() * 3; // 2.5-5.5%
  const refundsLast30Days = Math.random() < 0.4 ? Math.random() * 45 : 0; // Sometimes refunds
  const totalRevenue = mrr * 6 + Math.random() * 200; // Rough estimate
  
  return {
    mrr: Math.round(mrr * 100) / 100,
    activeSubscriptions: activeSubs,
    churnRate: Math.round(churnRate * 100) / 100,
    refundsLast30Days: Math.round(refundsLast30Days * 100) / 100,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
  };
}

export interface Log {
  id: string;
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  source: 'api' | 'database' | 'auth' | 'system' | 'stripe' | 'webhook' | 'job';
  userId?: string;
  requestId?: string;
  stackTrace?: string;
  metadata?: Record<string, any>;
}

/**
 * Generate mock log entries
 */
export function generateMockLogs(
  count: number = 50,
  options?: {
    level?: 'error' | 'warn' | 'info' | 'debug';
    source?: 'api' | 'database' | 'auth' | 'system' | 'stripe' | 'webhook' | 'job';
    timeRange?: number; // hours
  }
): Log[] {
  const logs: Log[] = [];
  const timeRange = options?.timeRange || 24; // Default 24 hours
  const now = Date.now();
  
  // Log templates by type
  const errorMessages = {
    api: [
      'Internal server error: Failed to process request',
      'Request timeout after 30s: GET /api/memories',
      'Validation error: Invalid request body',
      'Rate limit exceeded for IP: 192.168.1.1',
      'Failed to fetch user data: Connection refused',
    ],
    database: [
      'Database connection pool exhausted',
      'Query timeout: SELECT * FROM journal_entries WHERE user_id = $1',
      'Foreign key constraint violation: user_id does not exist',
      'Deadlock detected: Transaction rollback required',
      'Connection lost: Retrying database connection',
    ],
    auth: [
      'Invalid JWT token: expired_at=2025-01-30T10:00:00Z',
      'Authentication failed: Invalid credentials',
      'Permission denied: User does not have admin role',
      'Session expired: User session not found',
      'Token validation error: Malformed token structure',
    ],
    system: [
      'Memory usage critical: 95% of available memory',
      'Disk space warning: 85% capacity reached',
      'Service restart required: Configuration changed',
      'Cluster rebuild job failed: Insufficient resources',
      'Cache flush operation timed out',
    ],
    stripe: [
      'Webhook signature verification failed',
      'Stripe API error: Payment method declined',
      'Subscription update failed: Customer not found',
      'Webhook processing error: Invalid event type',
    ],
    webhook: [
      'Webhook delivery failed: HTTP 500 from external service',
      'Webhook retry exhausted: Max attempts reached',
      'Invalid webhook payload: Missing required fields',
    ],
    job: [
      'Embedding reindex job failed: Out of memory',
      'Cluster rebuild job completed: 1,234 memories processed',
      'Scheduled task skipped: Previous execution still running',
    ],
  };
  
  const warnMessages = {
    api: [
      'Rate limit approaching for user_id: abc123',
      'Deprecated API endpoint used: /api/v1/memories',
      'Slow query detected: 2.5s response time',
      'Large payload size: 5.2MB request body',
    ],
    database: [
      'Query performance degraded: Missing index on user_id',
      'Connection pool at 80% capacity',
      'Long-running transaction detected: 45s',
    ],
    auth: [
      'Multiple failed login attempts from IP: 192.168.1.1',
      'Token refresh rate limit warning',
    ],
    system: [
      'High CPU usage: 85% average over 5 minutes',
      'Cache hit rate below threshold: 60%',
    ],
    stripe: [
      'Webhook retry scheduled: Previous attempt failed',
      'Payment method update pending: Customer action required',
    ],
    webhook: [
      'Webhook delivery delayed: Retrying in 30s',
    ],
    job: [
      'Job queue backlog: 15 pending jobs',
      'Embedding processing slower than expected',
    ],
  };
  
  const infoMessages = {
    api: [
      'User authenticated successfully: user_id=abc123',
      'Memory created: id=mem_456, user_id=abc123',
      'API request processed: GET /api/memories, 200ms',
      'Webhook received: invoice.payment_succeeded',
    ],
    database: [
      'Database connection established',
      'Query executed successfully: 1,234 rows returned',
      'Index created: idx_user_memories',
    ],
    auth: [
      'User session created: user_id=abc123',
      'Password reset email sent: user_id=abc123',
      'User role updated: user_id=abc123, role=admin',
    ],
    system: [
      'Server started: Listening on port 3000',
      'Cache flushed successfully',
      'Cluster rebuild job started: Processing 5,000 memories',
      'Deployment completed: v1.2.3',
    ],
    stripe: [
      'Webhook processed: invoice.payment_succeeded',
      'Subscription created: sub_1234567890',
      'Payment succeeded: $15.00, invoice_id=inv_abc',
    ],
    webhook: [
      'Webhook delivered successfully: HTTP 200',
      'Webhook queued: Processing in background',
    ],
    job: [
      'Embedding reindex job started',
      'Cluster rebuild job completed: 2,345 clusters created',
      'Scheduled backup completed: 1.2GB',
    ],
  };
  
  const debugMessages = {
    api: [
      'Request headers: { "content-type": "application/json" }',
      'Response payload size: 1.2KB',
      'Cache hit: Key=user:abc123:memories',
    ],
    database: [
      'Query plan: Index scan on journal_entries_user_id_idx',
      'Connection pool stats: 10/50 connections in use',
    ],
    auth: [
      'Token payload decoded: { "user_id": "abc123", "exp": 1234567890 }',
      'Session lookup: Cache hit',
    ],
    system: [
      'Memory stats: Heap used: 245MB, Heap total: 512MB',
      'GC event: Mark-sweep, duration: 45ms',
    ],
    stripe: [],
    webhook: [],
    job: [],
  };
  
  const sources: Array<'api' | 'database' | 'auth' | 'system' | 'stripe' | 'webhook' | 'job'> = 
    ['api', 'database', 'auth', 'system', 'stripe', 'webhook', 'job'];
  const levels: Array<'error' | 'warn' | 'info' | 'debug'> = ['error', 'warn', 'info', 'debug'];
  
  // Distribution: 10% error, 15% warn, 60% info, 15% debug
  const getLevel = (): 'error' | 'warn' | 'info' | 'debug' => {
    if (options?.level) return options.level;
    const rand = Math.random();
    if (rand < 0.1) return 'error';
    if (rand < 0.25) return 'warn';
    if (rand < 0.85) return 'info';
    return 'debug';
  };
  
  const getSource = (): 'api' | 'database' | 'auth' | 'system' | 'stripe' | 'webhook' | 'job' => {
    if (options?.source) return options.source;
    return sources[Math.floor(Math.random() * sources.length)];
  };
  
  const getMessage = (level: string, source: string): string => {
    const messages = 
      level === 'error' ? errorMessages[source as keyof typeof errorMessages] :
      level === 'warn' ? warnMessages[source as keyof typeof warnMessages] :
      level === 'info' ? infoMessages[source as keyof typeof infoMessages] :
      debugMessages[source as keyof typeof debugMessages];
    
    if (!messages || messages.length === 0) {
      return `${level.toUpperCase()}: ${source} operation completed`;
    }
    
    return messages[Math.floor(Math.random() * messages.length)];
  };
  
  const getStackTrace = (source: string): string | undefined => {
    if (Math.random() > 0.3) return undefined; // 70% of errors have stack traces
    
    return `Error: ${getMessage('error', source)}
    at processRequest (/app/src/routes/api.ts:45:12)
    at async handleRequest (/app/src/middleware/handler.ts:23:8)
    at async expressHandler (/app/src/server.ts:67:15)
    at Layer.handle [as handle_request] (/node_modules/express/lib/router/layer.js:95:5)
    at next (/node_modules/express/lib/router/route.js:144:13)
    at Route.dispatch (/node_modules/express/lib/router/route.js:114:3)`;
  };
  
  for (let i = 0; i < count; i++) {
    const level = getLevel();
    const source = getSource();
    const message = getMessage(level, source);
    
    // Generate timestamp within time range (newest first)
    const hoursAgo = (Math.random() * timeRange);
    const timestamp = new Date(now - hoursAgo * 60 * 60 * 1000).toISOString();
    
    // Generate optional fields
    const userId = Math.random() > 0.4 ? `user_${Math.random().toString(36).substring(2, 11)}` : undefined;
    const requestId = Math.random() > 0.5 ? `req_${Math.random().toString(36).substring(2, 15)}` : undefined;
    const stackTrace = level === 'error' ? getStackTrace(source) : undefined;
    
    const metadata: Record<string, any> = {};
    if (source === 'api' && requestId) {
      metadata.method = ['GET', 'POST', 'PUT', 'DELETE'][Math.floor(Math.random() * 4)];
      metadata.path = ['/api/memories', '/api/users', '/api/admin/metrics'][Math.floor(Math.random() * 3)];
      metadata.statusCode = level === 'error' ? 500 : level === 'warn' ? 429 : 200;
    }
    if (source === 'database') {
      metadata.queryTime = `${(Math.random() * 1000).toFixed(2)}ms`;
      metadata.rowsAffected = Math.floor(Math.random() * 100);
    }
    if (source === 'stripe') {
      metadata.eventId = `evt_${Math.random().toString(36).substring(2, 15)}`;
      metadata.customerId = `cus_${Math.random().toString(36).substring(2, 15)}`;
    }
    
    logs.push({
      id: `log_${i.toString().padStart(8, '0')}`,
      timestamp,
      level,
      message,
      source,
      userId,
      requestId,
      stackTrace,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });
  }
  
  // Sort by timestamp (newest first)
  return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

