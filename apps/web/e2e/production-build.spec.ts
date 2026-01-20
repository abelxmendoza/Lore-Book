import { test, expect } from '@playwright/test';

/**
 * Production Build Verification Tests
 * These tests verify that the production build loads correctly
 * and prevents black screen issues
 */

test.describe('Production Build Verification', () => {
  test.beforeEach(async ({ page }) => {
    // Set longer timeout for production builds
    test.setTimeout(30000);
  });

  test('should load main bundle without errors', async ({ page }) => {
    // Listen for console errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Listen for page errors
    page.on('pageerror', (error) => {
      errors.push(`Page error: ${error.message}`);
    });

    // Navigate to the app
    await page.goto('/', { waitUntil: 'networkidle' });

    // Check for critical errors
    const criticalErrors = errors.filter(
      (e) =>
        e.includes('forwardRef') ||
        e.includes('can\'t access property') ||
        e.includes('is undefined') ||
        e.includes('ReferenceError') ||
        e.includes('TypeError')
    );

    if (criticalErrors.length > 0) {
      console.error('Critical errors found:', criticalErrors);
    }

    expect(criticalErrors).toHaveLength(0);
  });

  test('should execute boot test', async ({ page }) => {
    const bootLogs: string[] = [];
    
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[BOOT]') || text.includes('boot')) {
        bootLogs.push(text);
      }
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    // Check that boot test executed
    const bootMarker = await page.evaluate(() => {
      return document.getElementById('lorekeeper-boot-marker');
    });

    expect(bootMarker).not.toBeNull();
    expect(bootLogs.length).toBeGreaterThan(0);
  });

  test('should render root element with content', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    // Wait for root element to have children
    await page.waitForSelector('#root', { state: 'attached' });
    
    const root = await page.locator('#root');
    const hasChildren = await root.evaluate((el) => el.hasChildNodes());

    expect(hasChildren).toBe(true);

    // Check that root is visible
    const isVisible = await root.isVisible();
    expect(isVisible).toBe(true);
  });

  test('should not have React.forwardRef errors', async ({ page }) => {
    const forwardRefErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('forwardRef')) {
        forwardRefErrors.push(msg.text());
      }
    });

    page.on('pageerror', (error) => {
      if (error.message.includes('forwardRef')) {
        forwardRefErrors.push(error.message);
      }
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    // Wait a bit for any async errors
    await page.waitForTimeout(2000);

    expect(forwardRefErrors).toHaveLength(0);
  });

  test('should load all required JavaScript bundles', async ({ page }) => {
    const failedRequests: string[] = [];

    page.on('requestfailed', (request) => {
      if (request.url().includes('.js')) {
        failedRequests.push(`${request.url()} - ${request.failure()?.errorText}`);
      }
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    expect(failedRequests).toHaveLength(0);
  });

  test('should have no unhandled promise rejections', async ({ page }) => {
    const rejections: string[] = [];

    page.on('console', (msg) => {
      if (msg.text().includes('unhandledrejection') || msg.text().includes('Unhandled')) {
        rejections.push(msg.text());
      }
    });

    // Listen for unhandled rejections
    await page.addInitScript(() => {
      window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled rejection:', event.reason);
      });
    });

    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Filter out known non-critical rejections
    const criticalRejections = rejections.filter(
      (r) => !r.includes('127.0.0.1:7242') // Debug endpoint failures are OK
    );

    expect(criticalRejections).toHaveLength(0);
  });

  test('should display content within 5 seconds', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for any content to appear
    const hasContent = await page.waitForFunction(
      () => {
        const root = document.getElementById('root');
        return root && root.hasChildNodes() && root.offsetHeight > 0;
      },
      { timeout: 5000 }
    );

    expect(hasContent).toBeTruthy();
  });

  test('should not show error banner after 5 seconds', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    // Wait 5 seconds
    await page.waitForTimeout(5000);

    // Check for error banner
    const errorBanner = await page.locator('[data-boot-check]').isVisible().catch(() => false);
    expect(errorBanner).toBe(false);
  });
});
