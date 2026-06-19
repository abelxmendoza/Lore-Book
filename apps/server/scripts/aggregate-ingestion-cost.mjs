#!/usr/bin/env node

import fs from 'node:fs';

const USAGE = `
Usage:
  npm run cost:ingestion -- <log-file> [more-log-files]
  cat server.log | npm run cost:ingestion

Reads pino JSON logs best. Pretty logs are supported for top-level totals, but
per-detector breakdowns need structured JSON log lines.
`.trim();

function readInput() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  if (args.includes('-h') || args.includes('--help')) {
    console.log(USAGE);
    process.exit(0);
  }

  if (args.length > 0) {
    return args.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  }

  if (process.stdin.isTTY) {
    console.error(USAGE);
    process.exit(1);
  }

  return fs.readFileSync(0, 'utf8');
}

function parseJsonLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function emptySummary() {
  return {
    messages: 0,
    llmCalls: 0,
    productiveCalls: 0,
    wastedCalls: 0,
    skippedSteps: 0,
    entityExtractionSkipped: 0,
    stepStats: new Map(),
    skippedByReason: new Map(),
    jsonCostLines: 0,
    prettyCostBlocks: 0,
    malformedCostLines: 0,
    // Latency (stage.timing): per-operation totals + per-stage rollups.
    timingOps: new Map(),       // operation -> number[] of totalMs
    stageMs: new Map(),         // `${op}:${stage}` -> { sum, count }
    slowestCounts: new Map(),   // slowestStage -> count
  };
}

function recordTiming(summary, event) {
  const op = String(event.operation ?? 'unknown');
  if (!summary.timingOps.has(op)) summary.timingOps.set(op, []);
  summary.timingOps.get(op).push(Number(event.totalMs ?? 0));

  if (event.slowestStage) {
    const s = String(event.slowestStage);
    summary.slowestCounts.set(s, (summary.slowestCounts.get(s) ?? 0) + 1);
  }

  if (Array.isArray(event.stages)) {
    for (const stage of event.stages) {
      if (!stage || typeof stage !== 'object') continue;
      const key = `${op}:${String(stage.stage ?? 'unknown')}`;
      const cur = summary.stageMs.get(key) ?? { sum: 0, count: 0 };
      cur.sum += Number(stage.ms ?? 0);
      cur.count += 1;
      summary.stageMs.set(key, cur);
    }
  }
}

function getStep(summary, stepName) {
  const name = stepName || 'unknown';
  if (!summary.stepStats.has(name)) {
    summary.stepStats.set(name, {
      step: name,
      eligible: 0,
      invoked: 0,
      productive: 0,
      wasted: 0,
      skipped: 0,
    });
  }
  return summary.stepStats.get(name);
}

function recordCost(summary, event, source) {
  const llmCalls = Number(event.llmCalls ?? 0);
  const productiveCalls = Number(event.productiveCalls ?? 0);
  const wastedCalls = Number(event.wastedCalls ?? Math.max(0, llmCalls - productiveCalls));
  const skippedSteps = Number(event.skippedSteps ?? 0);

  summary.messages += 1;
  summary.llmCalls += llmCalls;
  summary.productiveCalls += productiveCalls;
  summary.wastedCalls += wastedCalls;
  summary.skippedSteps += skippedSteps;
  if (source === 'json') summary.jsonCostLines += 1;
  if (source === 'pretty') summary.prettyCostBlocks += 1;

  if (!Array.isArray(event.steps)) return;

  for (const step of event.steps) {
    if (!step || typeof step !== 'object') continue;
    const stat = getStep(summary, String(step.step ?? 'unknown'));
    const eligible = step.eligible === true;
    const invoked = step.invoked === true;
    const productive = step.productive === true;

    if (eligible) stat.eligible += 1;
    if (invoked) stat.invoked += 1;
    if (productive) stat.productive += 1;
    if (invoked && !productive) stat.wasted += 1;
    if (!eligible) stat.skipped += 1;
  }
}

function parseJsonLogs(text, summary) {
  for (const line of text.split(/\r?\n/)) {
    if (
      !line.includes('ingestion.cost') &&
      !line.includes('ingestion.entity_extraction.skipped') &&
      !line.includes('entity_extraction.skipped') &&
      !line.includes('stage.timing')
    ) {
      continue;
    }

    const event = parseJsonLine(line);
    if (!event) {
      if (line.includes('ingestion.cost') && line.includes('{')) summary.malformedCostLines += 1;
      continue;
    }

    const msg = String(event.msg ?? event.message ?? '');
    if (msg === 'ingestion.cost' || line.includes('"ingestion.cost"')) {
      recordCost(summary, event, 'json');
      continue;
    }

    if (msg === 'stage.timing' || line.includes('"stage.timing"')) {
      recordTiming(summary, event);
      continue;
    }

    if (msg === 'ingestion.entity_extraction.skipped' || msg === 'entity_extraction.skipped') {
      summary.entityExtractionSkipped += 1;
      const reason = String(event.reason ?? 'unknown');
      summary.skippedByReason.set(reason, (summary.skippedByReason.get(reason) ?? 0) + 1);
    }
  }
}

function parsePrettyCostBlocks(text, summary) {
  if (summary.jsonCostLines > 0) return;

  const lines = text.split(/\r?\n/);
  let active = null;

  const flush = () => {
    if (!active) return;
    if (active.sawMetric) {
      recordCost(summary, active, 'pretty');
    } else {
      summary.malformedCostLines += 1;
    }
    active = null;
  };

  for (const line of lines) {
    if (line.includes('ingestion.entity_extraction.skipped') || line.includes('entity_extraction.skipped')) {
      summary.entityExtractionSkipped += 1;
      const reasonMatch = line.match(/reason[:=]\s*["']?([^"',}]+)/);
      const reason = reasonMatch?.[1]?.trim() || 'unknown';
      summary.skippedByReason.set(reason, (summary.skippedByReason.get(reason) ?? 0) + 1);
    }

    if (line.includes('ingestion.cost')) {
      flush();
      active = { llmCalls: 0, productiveCalls: 0, wastedCalls: 0, skippedSteps: 0, sawMetric: false };
      continue;
    }

    if (!active) continue;

    if (/^\S/.test(line) && !/^\s/.test(line)) {
      flush();
      continue;
    }

    for (const key of ['llmCalls', 'productiveCalls', 'wastedCalls', 'skippedSteps']) {
      const match = line.match(new RegExp(`\\b${key}\\s*:\\s*(\\d+)`));
      if (match) {
        active[key] = Number(match[1]);
        active.sawMetric = true;
      }
    }
  }

  flush();
}

function pct(numerator, denominator) {
  if (!denominator) return '0.0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function avg(value, count) {
  if (!count) return '0.00';
  return (value / count).toFixed(2);
}

function printTable(rows, columns) {
  if (rows.length === 0) return;
  const widths = columns.map((column) =>
    Math.max(
      column.label.length,
      ...rows.map((row) => String(row[column.key] ?? '').length)
    )
  );

  const format = (row) =>
    columns.map((column, index) => String(row[column.key] ?? '').padEnd(widths[index])).join('  ');

  console.log(format(Object.fromEntries(columns.map((column) => [column.key, column.label]))));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of rows) console.log(format(row));
}

function printSummary(summary) {
  console.log('Ingestion Cost Summary');
  console.log('======================');
  console.log(`Messages measured:          ${summary.messages}`);
  console.log(`Total LLM calls:            ${summary.llmCalls}`);
  console.log(`Avg LLM calls/message:      ${avg(summary.llmCalls, summary.messages)}`);
  console.log(`Productive calls:           ${summary.productiveCalls} (${pct(summary.productiveCalls, summary.llmCalls)} of calls)`);
  console.log(`Wasted calls:               ${summary.wastedCalls} (${pct(summary.wastedCalls, summary.llmCalls)} of calls)`);
  console.log(`Skipped detector steps:     ${summary.skippedSteps}`);
  console.log(`Entity extraction skips:    ${summary.entityExtractionSkipped}`);
  console.log(`Structured cost lines:      ${summary.jsonCostLines}`);
  if (summary.prettyCostBlocks > 0) console.log(`Pretty cost blocks:         ${summary.prettyCostBlocks}`);
  if (summary.malformedCostLines > 0) console.log(`Unparsed cost lines/blocks: ${summary.malformedCostLines}`);

  const stepRows = [...summary.stepStats.values()]
    .sort((a, b) => b.wasted - a.wasted || b.invoked - a.invoked)
    .map((step) => ({
      step: step.step,
      eligible: step.eligible,
      invoked: step.invoked,
      productive: step.productive,
      wasted: step.wasted,
      skipped: step.skipped,
      wasteRate: pct(step.wasted, step.invoked),
      productivity: pct(step.productive, step.invoked),
    }));

  if (stepRows.length > 0) {
    console.log('\nDetector Breakdown');
    console.log('------------------');
    printTable(stepRows, [
      { key: 'step', label: 'step' },
      { key: 'eligible', label: 'eligible' },
      { key: 'invoked', label: 'invoked' },
      { key: 'productive', label: 'productive' },
      { key: 'wasted', label: 'wasted' },
      { key: 'skipped', label: 'skipped' },
      { key: 'wasteRate', label: 'wasteRate' },
      { key: 'productivity', label: 'productivity' },
    ]);
  } else if (summary.messages > 0) {
    console.log('\nDetector Breakdown');
    console.log('------------------');
    console.log('Unavailable. Use JSON pino logs for per-step breakdowns.');
  }

  const reasonRows = [...summary.skippedByReason.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count }));

  if (reasonRows.length > 0) {
    console.log('\nEntity Extraction Skip Reasons');
    console.log('------------------------------');
    printTable(reasonRows, [
      { key: 'reason', label: 'reason' },
      { key: 'count', label: 'count' },
    ]);
  }

  printTimingSummary(summary);

  if (summary.messages === 0 && summary.entityExtractionSkipped === 0 && summary.timingOps.size === 0) {
    console.log('\nNo ingestion.cost, entity_extraction.skipped, or stage.timing events found.');
  }
}

function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length));
  return sortedAsc[idx];
}

function printTimingSummary(summary) {
  if (summary.timingOps.size === 0) return;

  console.log('\nStage Latency');
  console.log('=============');
  for (const [op, totals] of summary.timingOps) {
    const sorted = [...totals].sort((a, b) => a - b);
    const mean = totals.reduce((x, y) => x + y, 0) / totals.length;
    console.log(
      `\n${op}  (n=${totals.length})  avg ${mean.toFixed(0)}ms  ` +
        `p50 ${percentile(sorted, 50)}ms  p95 ${percentile(sorted, 95)}ms`
    );
    const stageRows = [...summary.stageMs.entries()]
      .filter(([key]) => key.startsWith(`${op}:`))
      .map(([key, { sum, count }]) => ({
        stage: key.slice(op.length + 1),
        avgMs: (sum / count).toFixed(0),
        samples: count,
      }))
      .sort((a, b) => Number(b.avgMs) - Number(a.avgMs));
    printTable(stageRows, [
      { key: 'stage', label: 'stage' },
      { key: 'avgMs', label: 'avgMs' },
      { key: 'samples', label: 'samples' },
    ]);
  }

  const slowestRows = [...summary.slowestCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([stage, count]) => ({ stage, count }));
  if (slowestRows.length > 0) {
    console.log('\nSlowest-stage frequency (dominated each operation)');
    console.log('-------------------------------------------------');
    printTable(slowestRows, [
      { key: 'stage', label: 'stage' },
      { key: 'count', label: 'count' },
    ]);
  }
}

const text = readInput();
const summary = emptySummary();
parseJsonLogs(text, summary);
parsePrettyCostBlocks(text, summary);
printSummary(summary);
