/**
 * Instagram Analyzer Dashboard
 *
 * A standalone, near-full-screen analytics overlay that opens independently
 * inside the Instagram page (shadow DOM). Not a child of any compact panel.
 *
 * Layout (single scrollable page, top to bottom):
 *   Header (sticky) → KPI Cards → Trend Charts → Changes Chart
 *   → Quick Compare → User List → Scan History
 */

import { getLocale, t } from '../../../shared/i18n.js';
import {
  getInstagramAnalyzerState,
  getSettings
} from '../../../shared/storage.js';
import type {
  InstagramAnalyzerAccountState,
  InstagramAnalyzerDurableAccount,
  InstagramAnalyzerResultItem,
  InstagramAnalyzerScanHistoryEntry,
  InstagramAnalyzerSnapshotUser,
  InstagramAnalyzerState,
  ThemeChoice
} from '../../../shared/storage.js';
import { MESSAGE_TYPES } from '../../../shared/contracts/message-types.js';

/* ─────────────────────────────────────────────────────────────────── */
/* Constants                                                           */
/* ─────────────────────────────────────────────────────────────────── */

const DASHBOARD_HOST_ID = 'aio-ig-dashboard-host';
const LIST_PAGE_SIZE = 50;
const SPARKLINE_POINTS = 10;

type DashboardTheme = 'light' | 'dark';

type ListSource = 'non-followers' | 'whitelist' | 'following' | 'followers';

interface DashboardState {
  analyzerState: InstagramAnalyzerState;
  activeViewerId: string | null;
  activeUsername: string;
  listSource: ListSource;
  listSearchQuery: string;
  listPage: number;
  compareExpanded: boolean;
  compareScanAId: string | null;
  compareScanBId: string | null;
  historyExpandedScanId: string | null;
  isDisposed: boolean;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Helpers                                                             */
/* ─────────────────────────────────────────────────────────────────── */

function escHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(getLocale() === 'tr' ? 'tr-TR' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatRelativeTime(timestamp: number): string {
  const locale = getLocale();
  const formatter = new Intl.RelativeTimeFormat(locale === 'tr' ? 'tr' : 'en', { numeric: 'auto' });
  const now = Date.now();
  const diffMs = timestamp - now;
  const absMs = Math.abs(diffMs);

  if (absMs < 60 * 1000) return formatter.format(Math.round(diffMs / 1000), 'second');
  if (absMs < 60 * 60 * 1000) return formatter.format(Math.round(diffMs / 60000), 'minute');
  if (absMs < 24 * 3600 * 1000) return formatter.format(Math.round(diffMs / 3600000), 'hour');
  return formatter.format(Math.round(diffMs / 86400000), 'day');
}

function isContextInvalidatedError(error: unknown): boolean {
  return /context invalidated/i.test(String((error as { message?: string } | null)?.message ?? error ?? ''));
}

async function sendDashboardMessage(payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (!chrome?.runtime?.id) return null;
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        resolve(response as Record<string, unknown> | null);
      });
    } catch {
      resolve(null);
    }
  });
}

function parseRgb(color: string): [number, number, number] | null {
  const rgbMatch = color.trim().match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
  const hex = color.replace('#', '');
  if (/^[a-f0-9]{6}$/i.test(hex)) {
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  return null;
}

function getLuminance(color: string): number | null {
  const rgb = parseRgb(color);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const n = v / 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function inferSiteTheme(): DashboardTheme | null {
  const rootStyle = window.getComputedStyle(document.documentElement);
  const scheme = rootStyle.colorScheme || '';
  if (scheme.includes('dark')) return 'dark';
  if (scheme.includes('light')) return 'light';
  const bg = window.getComputedStyle(document.body).backgroundColor;
  if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
    const lum = getLuminance(bg);
    if (lum != null) return lum < 0.35 ? 'dark' : 'light';
  }
  return null;
}

function resolveTheme(themeChoice: ThemeChoice): DashboardTheme {
  if (themeChoice === 'dark' || themeChoice === 'light') return themeChoice;
  return inferSiteTheme() ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function resolveAccount(
  state: InstagramAnalyzerState,
  viewerId: string | null
): InstagramAnalyzerAccountState | null {
  if (viewerId && state.accounts[viewerId]) return state.accounts[viewerId] ?? null;
  if (state.currentViewerId && state.accounts[state.currentViewerId]) {
    return state.accounts[state.currentViewerId] ?? null;
  }
  return null;
}

function getHistoryPoints(account: InstagramAnalyzerAccountState | null): InstagramAnalyzerScanHistoryEntry[] {
  return account?.history ?? [];
}

/* ─────────────────────────────────────────────────────────────────── */
/* SVG Sparkline (inline, no dependency)                               */
/* ─────────────────────────────────────────────────────────────────── */

function renderSparkline(values: number[], color: string): string {
  if (values.length < 2) return '';
  const w = 64;
  const h = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <polyline points="${pts.join(' ')}" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`;
}

/* ─────────────────────────────────────────────────────────────────── */
/* SVG Line Chart                                                       */
/* ─────────────────────────────────────────────────────────────────── */

interface ChartLine {
  values: number[];
  color: string;
  label: string;
}

function renderLineChart(lines: ChartLine[], labels: string[], emptyMsg: string): string {
  const validLines = lines.filter((l) => l.values.length >= 2);
  if (validLines.length === 0 || labels.length < 2) {
    return `<div class="chart-empty">${escHtml(emptyMsg)}</div>`;
  }

  const w = 400;
  const h = 120;
  const padL = 36;
  const padB = 24;
  const padR = 8;
  const padT = 8;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const allVals = validLines.flatMap((l) => l.values);
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;
  const n = labels.length;

  const polylines = validLines.map((line) => {
    const pts = line.values.map((v, i) => {
      const x = padL + (i / (n - 1)) * chartW;
      const y = padT + chartH - ((v - min) / range) * chartH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `<polyline points="${pts.join(' ')}" stroke="${line.color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
  }).join('');

  // Y axis labels (3 ticks)
  const yTicks = [0, 0.5, 1].map((t) => {
    const val = Math.round(min + t * range);
    const y = padT + chartH - t * chartH;
    return `<text x="${(padL - 4).toFixed(0)}" y="${y.toFixed(0)}" fill="currentColor" font-size="9" text-anchor="end" dominant-baseline="middle" opacity="0.5">${val}</text>
<line x1="${padL}" y1="${y.toFixed(0)}" x2="${(padL + chartW).toFixed(0)}" y2="${y.toFixed(0)}" stroke="currentColor" stroke-width="0.5" opacity="0.1"/>`;
  }).join('');

  // X axis labels (first and last)
  const xLabels = [0, n - 1].map((i) => {
    const x = padL + (i / (n - 1)) * chartW;
    const label = labels[i] ?? '';
    return `<text x="${x.toFixed(0)}" y="${(h - 4).toFixed(0)}" fill="currentColor" font-size="8" text-anchor="${i === 0 ? 'start' : 'end'}" opacity="0.5">${escHtml(label)}</text>`;
  }).join('');

  // Legend
  const legend = validLines.map((line) =>
    `<span class="chart-legend-item"><span class="chart-legend-dot" style="background:${line.color}"></span>${escHtml(line.label)}</span>`
  ).join('');

  return `
    <div class="chart-legend">${legend}</div>
    <div class="chart-svg-wrap">
      <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" class="chart-svg" aria-label="${escHtml(validLines.map((l) => l.label).join(', '))}">
        ${yTicks}${polylines}${xLabels}
      </svg>
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────────────── */
/* SVG Bar Chart (grouped, positive/negative)                          */
/* ─────────────────────────────────────────────────────────────────── */

interface BarGroup {
  label: string;
  bars: Array<{ value: number; color: string; label: string }>;
}

function renderBarChart(groups: BarGroup[], emptyMsg: string): string {
  const validGroups = groups.filter((g) => g.bars.some((b) => b.value !== 0));
  if (validGroups.length === 0) {
    return `<div class="chart-empty">${escHtml(emptyMsg)}</div>`;
  }

  const w = 400;
  const h = 110;
  const padB = 24;
  const padT = 8;
  const padL = 8;
  const padR = 8;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const midY = padT + chartH / 2;

  const allVals = validGroups.flatMap((g) => g.bars.map((b) => Math.abs(b.value)));
  const maxVal = Math.max(...allVals, 1);

  const groupW = chartW / validGroups.length;
  const barsPerGroup = Math.max(...validGroups.map((g) => g.bars.length));
  const barW = Math.max(4, Math.min(12, (groupW - 4) / barsPerGroup - 2));

  const rects = validGroups.flatMap((group, gi) => {
    const gx = padL + gi * groupW + groupW / 2;
    const halfBars = (group.bars.length - 1) / 2;
    return group.bars.map((bar, bi) => {
      const bx = gx + (bi - halfBars) * (barW + 2) - barW / 2;
      const barH = (Math.abs(bar.value) / maxVal) * (chartH / 2);
      const by = bar.value >= 0 ? midY - barH : midY;
      const rx = 2;
      return `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="${rx}" fill="${bar.color}" opacity="0.85">
        <title>${escHtml(bar.label)}: ${bar.value}</title>
      </rect>`;
    });
  });

  // X axis labels (show every other group if many)
  const step = validGroups.length > 8 ? Math.ceil(validGroups.length / 6) : 1;
  const xLabels = validGroups.map((group, gi) => {
    if (gi % step !== 0) return '';
    const x = padL + gi * groupW + groupW / 2;
    const label = group.label.slice(0, 6);
    return `<text x="${x.toFixed(0)}" y="${(h - 4).toFixed(0)}" fill="currentColor" font-size="7" text-anchor="middle" opacity="0.5">${escHtml(label)}</text>`;
  }).join('');

  // Center line
  const centerLine = `<line x1="${padL}" y1="${midY.toFixed(0)}" x2="${(padL + chartW).toFixed(0)}" y2="${midY.toFixed(0)}" stroke="currentColor" stroke-width="0.5" opacity="0.2"/>`;

  // Legend (first group's bars)
  const firstGroup = validGroups[0];
  const legend = firstGroup?.bars.map((bar) =>
    `<span class="chart-legend-item"><span class="chart-legend-dot" style="background:${bar.color}"></span>${escHtml(bar.label)}</span>`
  ).join('') ?? '';

  return `
    <div class="chart-legend">${legend}</div>
    <div class="chart-svg-wrap">
      <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" class="chart-svg" aria-label="${t('dashboardChangesChartLabel')}">
        ${centerLine}${rects.join('')}${xLabels}
      </svg>
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────────────── */
/* CSS                                                                 */
/* ─────────────────────────────────────────────────────────────────── */

const DASHBOARD_CSS = `
  :host { all: initial; }

  .db-root {
    --bg: rgba(248, 250, 252, 0.98);
    --surface: #ffffff;
    --surface-2: #f1f5f9;
    --surface-3: #e2e8f0;
    --border: rgba(148, 163, 184, 0.25);
    --border-strong: rgba(100, 116, 139, 0.35);
    --text: #0f172a;
    --text-2: #475569;
    --text-3: #94a3b8;
    --accent: #2563eb;
    --accent-muted: #dbeafe;
    --success: #15803d;
    --success-muted: #dcfce7;
    --warning: #b45309;
    --warning-muted: #fef3c7;
    --error: #be123c;
    --error-muted: #ffe4e6;
    --shadow: 0 32px 80px rgba(15, 23, 42, 0.22), 0 2px 8px rgba(15, 23, 42, 0.08);
    --c-following: #3b82f6;
    --c-followers: #10b981;
    --c-nonfollowers: #f59e0b;
    --c-whitelisted: #8b5cf6;
    --c-pos: #10b981;
    --c-neg: #ef4444;
    --c-pos-light: #bbf7d0;
    --c-neg-light: #fecdd3;
    font: 400 13px/1.5 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: var(--text);
  }

  .db-root[data-theme='dark'] {
    --bg: rgba(10, 15, 30, 0.97);
    --surface: #0f172a;
    --surface-2: #111c31;
    --surface-3: #1e293b;
    --border: rgba(148, 163, 184, 0.14);
    --border-strong: rgba(148, 163, 184, 0.24);
    --text: #e2e8f0;
    --text-2: #94a3b8;
    --text-3: #475569;
    --accent: #60a5fa;
    --accent-muted: #1e3a5f;
    --success: #34d399;
    --success-muted: #064e3b;
    --warning: #fbbf24;
    --warning-muted: #451a03;
    --error: #f87171;
    --error-muted: #450a0a;
    --shadow: 0 40px 100px rgba(0, 0, 0, 0.6);
    --c-following: #60a5fa;
    --c-followers: #34d399;
    --c-nonfollowers: #fbbf24;
    --c-whitelisted: #a78bfa;
    --c-pos: #34d399;
    --c-neg: #f87171;
    --c-pos-light: #064e3b;
    --c-neg-light: #450a0a;
  }

  /* Backdrop */
  .db-backdrop {
    position: fixed;
    inset: 0;
    z-index: 2147483640;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
  }

  /* Dashboard panel */
  .db-panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 2147483641;
    width: min(1100px, calc(100vw - 48px));
    height: min(calc(100vh - 48px), 100%);
    max-height: calc(100vh - 48px);
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 16px;
    box-shadow: var(--shadow);
    overflow: hidden;
    color: var(--text);
  }

  /* Header */
  .db-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    background: var(--surface);
  }

  .db-header-account {
    flex: 1;
    min-width: 0;
  }

  .db-account-link {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }

  .db-account-link:hover { text-decoration: underline; }

  .db-last-scan {
    font-size: 11px;
    color: var(--text-3);
    margin-top: 1px;
  }

  .db-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .db-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 0.1s;
  }

  .db-btn:hover { opacity: 0.8; }
  .db-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .db-btn[disabled] { opacity: 0.45; cursor: not-allowed; }

  .db-btn-primary {
    background: var(--accent-muted);
    color: var(--accent);
    border-color: transparent;
  }

  .db-btn-close {
    width: 32px;
    padding: 0;
    font-size: 14px;
  }

  /* Scrollable body */
  .db-body {
    flex: 1;
    overflow-y: auto;
    padding: 24px 20px;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  /* Section */
  .db-section { display: flex; flex-direction: column; gap: 12px; }

  .db-section-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  /* KPI grid */
  .db-kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .db-kpi-card {
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .db-kpi-label {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .db-kpi-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 8px;
  }

  .db-kpi-value {
    font-size: 24px;
    font-weight: 700;
    line-height: 1;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }

  .db-kpi-delta {
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    padding: 2px 6px;
    border-radius: 999px;
    white-space: nowrap;
  }

  .db-kpi-delta.pos { color: var(--success); background: var(--success-muted); }
  .db-kpi-delta.neg { color: var(--error); background: var(--error-muted); }
  .db-kpi-delta.neutral { color: var(--text-3); background: var(--surface-2); }

  .db-kpi-sparkline { line-height: 0; }
  .db-kpi-sparkline svg { display: block; }

  /* Charts grid */
  .db-charts-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .db-chart-card {
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .db-chart-title {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-2);
  }

  .chart-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .chart-legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: var(--text-3);
  }

  .chart-legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .chart-svg-wrap {
    width: 100%;
    overflow: hidden;
  }

  .chart-svg {
    width: 100%;
    height: auto;
    color: var(--text);
    display: block;
  }

  .chart-empty {
    padding: 28px 12px;
    text-align: center;
    color: var(--text-3);
    font-size: 12px;
    border: 1px dashed var(--border-strong);
    border-radius: 10px;
  }

  /* Changes chart (full width) */
  .db-chart-full {
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* Quick Compare */
  .db-compare-card {
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    overflow: hidden;
  }

  .db-compare-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
    gap: 12px;
  }

  .db-compare-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .db-compare-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0;
    border-bottom: 1px solid var(--border);
  }

  .db-compare-metric {
    padding: 16px;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .db-compare-metric:last-child { border-right: none; }

  .db-compare-metric-label {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .db-compare-metric-value {
    font-size: 20px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    color: var(--text);
  }

  .db-compare-metric-was {
    font-size: 10px;
    color: var(--text-3);
  }

  .db-compare-metric-delta {
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .db-compare-metric-delta.pos { color: var(--success); }
  .db-compare-metric-delta.neg { color: var(--error); }

  .db-compare-summary {
    padding: 12px 18px;
    font-size: 12px;
    color: var(--text-2);
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .db-compare-summary-item { display: flex; gap: 4px; }
  .db-compare-summary-val { font-weight: 700; }
  .db-compare-summary-val.pos { color: var(--success); }
  .db-compare-summary-val.neg { color: var(--error); }

  .db-compare-expand-row {
    padding: 10px 18px;
  }

  .db-compare-diff {
    padding: 0 18px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .db-compare-diff-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .db-diff-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 200px;
    overflow-y: auto;
  }

  .db-diff-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-2);
  }

  .db-diff-item a {
    font-size: 12px;
    font-weight: 700;
    color: var(--accent);
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .db-diff-item a:hover { text-decoration: underline; }

  .db-compare-empty {
    padding: 20px 18px;
    font-size: 12px;
    color: var(--text-3);
    text-align: center;
  }

  /* User List */
  .db-list-card {
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    overflow: hidden;
  }

  .db-list-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
  }

  .db-list-source-select,
  .db-list-search {
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--text);
    font: inherit;
    font-size: 12px;
  }

  .db-list-source-select { cursor: pointer; min-width: 160px; }
  .db-list-search { flex: 1; min-width: 140px; }
  .db-list-search::placeholder { color: var(--text-3); }

  .db-list-source-select:focus-visible,
  .db-list-search:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  .db-list-count {
    font-size: 11px;
    color: var(--text-3);
    white-space: nowrap;
    margin-left: auto;
  }

  .db-list-items {
    display: flex;
    flex-direction: column;
  }

  .db-list-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 18px;
    border-bottom: 1px solid var(--border);
  }

  .db-list-item:last-child { border-bottom: none; }

  .db-list-avatar {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--surface-3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    color: var(--text-2);
    flex-shrink: 0;
    overflow: hidden;
  }

  .db-list-avatar img {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    object-fit: cover;
  }

  .db-list-user {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .db-list-username {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: inline-block;
    align-self: flex-start;
    max-width: 100%;
  }

  .db-list-username:hover { text-decoration: underline; color: var(--accent); }

  .db-list-fullname {
    font-size: 11px;
    color: var(--text-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .db-list-badges {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .db-mini-badge {
    font-size: 9px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 999px;
    background: var(--surface-3);
    color: var(--text-3);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .db-wl-btn {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--surface);
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.1s;
  }

  .db-wl-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .db-wl-btn[data-active='true'] { background: var(--success-muted); border-color: transparent; }

  .db-unfollow-btn {
    height: 30px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid transparent;
    background: var(--error-muted);
    color: var(--error);
    cursor: pointer;
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .db-unfollow-btn[disabled] {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .db-list-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 18px;
    border-top: 1px solid var(--border);
    gap: 10px;
    flex-wrap: wrap;
  }

  .db-list-pagination {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .db-page-indicator {
    font-size: 11px;
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }

  .db-list-actions {
    display: flex;
    gap: 8px;
  }

  .db-list-empty {
    padding: 32px 18px;
    text-align: center;
    color: var(--text-3);
    font-size: 13px;
  }

  /* Scan History */
  .db-history-card {
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    overflow: hidden;
  }

  .db-history-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
  }

  .db-history-header-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
  }

  .db-history-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 18px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: background 0.1s;
  }

  .db-history-row:last-child { border-bottom: none; }
  .db-history-row:hover { background: var(--surface-2); }

  .db-history-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }

  .db-history-row-date {
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
  }

  .db-history-row-meta {
    font-size: 11px;
    color: var(--text-3);
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .db-history-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    flex-shrink: 0;
  }

  .db-history-pill {
    font-size: 9px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--surface-3);
    color: var(--text-3);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    white-space: nowrap;
  }

  .db-history-expand-icon {
    font-size: 12px;
    color: var(--text-3);
    flex-shrink: 0;
    transition: transform 0.15s;
  }

  .db-history-row[data-expanded='true'] .db-history-expand-icon {
    transform: rotate(90deg);
  }

  .db-history-detail {
    padding: 16px 18px;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .db-history-detail-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .db-history-stat {
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
  }

  .db-history-stat-k {
    font-size: 9px;
    font-weight: 700;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    display: block;
  }

  .db-history-stat-v {
    font-size: 15px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--text);
    display: block;
    margin-top: 3px;
  }

  .db-history-detail-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  /* Responsive */
  @media (max-width: 900px) {
    .db-panel {
      width: calc(100vw - 24px);
      height: calc(100vh - 24px);
      border-radius: 12px;
    }

    .db-kpi-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .db-charts-grid {
      grid-template-columns: 1fr;
    }

    .db-compare-metrics {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 600px) {
    .db-panel {
      width: 100vw;
      height: 100vh;
      max-height: 100vh;
      border-radius: 0;
      top: 0;
      left: 0;
      transform: none;
    }

    .db-compare-metrics {
      grid-template-columns: 1fr;
    }

    .db-history-detail-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  /* Focus outlines */
  .db-btn:focus-visible,
  .db-wl-btn:focus-visible,
  .db-unfollow-btn:focus-visible,
  .db-history-row:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* ── Hover Card ─────────────────────────────── */
  .db-hover-card {
    position: fixed;
    z-index: 2147483647;
    width: 280px;
    max-width: min(280px, calc(100vw - 20px));
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 18px;
    box-shadow: 0 18px 44px rgba(0,0,0,0.24), 0 4px 14px rgba(0,0,0,0.10);
    overflow: hidden;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.14s ease, transform 0.14s ease;
  }

  .db-hover-card.db-hover-card--from-bottom {
    transform-origin: top left;
    transform: translateY(-4px) scale(0.97);
  }

  .db-hover-card.db-hover-card--from-top {
    transform-origin: bottom left;
    transform: translateY(4px) scale(0.97);
  }

  .db-hover-card.db-hover-card--visible {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
  }

  .db-hover-hero {
    padding: 14px 14px 10px;
    background:
      radial-gradient(circle at top right, rgba(0, 149, 246, 0.14), transparent 34%),
      linear-gradient(180deg, var(--surface-2), var(--surface));
    border-bottom: 1px solid var(--border);
  }

  .db-hover-top {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .db-hover-avatar {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--surface-3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 700;
    color: var(--text-2);
    flex-shrink: 0;
    overflow: hidden;
    border: 2px solid rgba(255,255,255,0.55);
  }

  .db-hover-avatar img {
    width: 52px;
    height: 52px;
    object-fit: cover;
    border-radius: 50%;
    display: block;
  }

  .db-hover-identity {
    flex: 1;
    min-width: 0;
  }

  .db-hover-name-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .db-hover-username {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .db-hover-verified-icon {
    flex-shrink: 0;
    width: 14px;
    height: 14px;
    fill: #0095f6;
    display: block;
  }

  .db-hover-fullname {
    margin-top: 3px;
    font-size: 12px;
    color: var(--text-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .db-hover-profile-link {
    margin-top: 4px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--accent);
    text-decoration: none;
    font-size: 11px;
    font-weight: 700;
  }

  .db-hover-profile-link:hover {
    text-decoration: underline;
  }

  .db-hover-tags {
    display: flex;
    gap: 6px;
    margin-top: 7px;
    flex-wrap: wrap;
  }

  .db-hover-tag {
    font-size: 10px;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 999px;
    background: var(--surface-3);
    color: var(--text-3);
    letter-spacing: 0.02em;
  }

  .db-hover-tag--wl  { background: var(--success-muted); color: var(--success); }
  .db-hover-tag--prv { background: var(--warning-muted); color: var(--warning); }
  .db-hover-tag--verified { background: rgba(0, 149, 246, 0.14); color: #0095f6; }
  .db-hover-tag--pending { background: var(--error-muted); color: var(--error); }

  .db-hover-summary {
    padding: 10px 14px 12px;
    color: var(--text-2);
    font-size: 11px;
    line-height: 1.45;
  }

  .db-hover-summary-strong {
    color: var(--text);
    font-weight: 700;
  }

  .db-hover-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    padding: 0 14px 12px;
  }

  .db-hover-stat {
    border: 1px solid var(--border);
    background: var(--surface-2);
    border-radius: 12px;
    padding: 8px 6px;
    text-align: center;
  }

  .db-hover-stat-label {
    display: block;
    font-size: 10px;
    color: var(--text-3);
    margin-bottom: 4px;
  }

  .db-hover-stat-value {
    display: block;
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
  }

  .db-hover-actions {
    display: flex;
    gap: 8px;
    padding: 0 14px 14px;
  }

  .db-hover-btn {
    flex: 1;
    min-width: 0;
    height: 34px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text);
    font: 700 11px/1 system-ui, -apple-system, sans-serif;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    transition: opacity 0.1s;
    white-space: nowrap;
    padding: 0 10px;
  }

  .db-hover-btn:hover { opacity: 0.75; }
  .db-hover-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  .db-hover-btn--profile {
    background: var(--accent-muted);
    color: var(--accent);
    border-color: transparent;
  }

  .db-hover-btn--wl-active {
    background: var(--success-muted);
    color: var(--success);
    border-color: transparent;
  }

  .db-hover-btn--danger {
    background: var(--error-muted);
    color: var(--error);
    border-color: transparent;
  }
`;

/* ─────────────────────────────────────────────────────────────────── */
/* Main render function                                                */
/* ─────────────────────────────────────────────────────────────────── */

function renderDashboard(
  state: DashboardState,
  account: InstagramAnalyzerAccountState | null,
  isUnfollowPending: (id: string) => boolean
): string {
  const history = getHistoryPoints(account);
  const username = state.activeUsername || account?.summary.username || '';
  const profileUrl = username
    ? `https://www.instagram.com/${encodeURIComponent(username)}/`
    : 'https://www.instagram.com/';

  const lastScanLabel = account?.summary.lastScannedAt
    ? t('analyzerLastScan').replace('{time}', formatRelativeTime(account.summary.lastScannedAt))
    : t('analyzerLastScanNever');

  const isRunning = account?.job?.status === 'running' || account?.summary.status === 'running';
  const scanLabel = isRunning
    ? t('analyzerScanRunning')
    : account?.summary.lastScannedAt
      ? t('analyzerScanRescan')
      : t('analyzerScanStart');

  return `
    ${renderKpiSection(account, history)}
    ${renderChartsSection(history)}
    ${renderChangesChartSection(history)}
    ${renderCompareSection(state, account, history)}
    ${renderListSection(state, account, isUnfollowPending)}
    ${renderHistorySection(state, history)}
    <div style="height:8px"></div>
  `.trim();

  void profileUrl; void lastScanLabel; void scanLabel;
}

/* ─────────────────────────────────────────────────────────────────── */
/* KPI Section                                                         */
/* ─────────────────────────────────────────────────────────────────── */

function renderKpiSection(
  account: InstagramAnalyzerAccountState | null,
  history: InstagramAnalyzerScanHistoryEntry[]
): string {
  const cur = account?.summary;
  const prev = history.length >= 2 ? history[1] : null;
  const latest = history.length >= 1 ? history[0] : null;

  const followingVals = history.slice(0, SPARKLINE_POINTS).reverse().map((h) => h.followingCount);
  const followerVals = history.slice(0, SPARKLINE_POINTS).reverse().map((h) => h.followerCount);
  const nfVals = history.slice(0, SPARKLINE_POINTS).reverse().map((h) => h.nonFollowerCount);
  const wlVals = history.slice(0, SPARKLINE_POINTS).reverse().map((h) => h.whitelistedCount);

  function delta(current: number, previous: number | null): string {
    if (previous == null || !cur?.lastScannedAt) return '';
    const d = current - previous;
    if (d === 0) return '';
    const cls = d > 0 ? 'pos' : 'neg';
    const sign = d > 0 ? '+' : '';
    return `<span class="db-kpi-delta ${cls}">${sign}${d}</span>`;
  }

  function kpiCard(label: string, value: string | number, vals: number[], color: string, deltaHtml: string): string {
    return `
      <div class="db-kpi-card">
        <div class="db-kpi-label">${escHtml(label)}</div>
        <div class="db-kpi-row">
          <span class="db-kpi-value">${escHtml(String(value))}</span>
          ${deltaHtml}
        </div>
        <div class="db-kpi-sparkline">${renderSparkline(vals, color)}</div>
      </div>
    `;
  }

  const followingDelta = delta(cur?.followingCount ?? 0, prev ? prev.followingCount : null);
  const followerDelta = delta(latest?.followerCount ?? 0, prev ? prev.followerCount : null);
  const nfDelta = delta(cur?.nonFollowerCount ?? 0, prev ? prev.nonFollowerCount : null);
  const wlDelta = delta(cur?.whitelistedCount ?? 0, prev ? prev.whitelistedCount : null);

  const followerDisplay = latest?.diffs.followersAvailable
    ? String(latest.followerCount)
    : '—';

  return `
    <div class="db-section">
      <div class="db-section-title">${t('dashboardSectionOverview')}</div>
      <div class="db-kpi-grid">
        ${kpiCard(t('analyzerFollowingCountLabel'), cur?.followingCount ?? 0, followingVals, 'var(--c-following)', followingDelta)}
        ${kpiCard(t('analyzerFollowerCountLabel'), followerDisplay, followerVals, 'var(--c-followers)', followerDelta)}
        ${kpiCard(t('analyzerNonFollowerCountLabel'), cur?.nonFollowerCount ?? 0, nfVals, 'var(--c-nonfollowers)', nfDelta)}
        ${kpiCard(t('analyzerWhitelistedCountLabel'), cur?.whitelistedCount ?? 0, wlVals, 'var(--c-whitelisted)', wlDelta)}
      </div>
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Trend Charts Section                                                */
/* ─────────────────────────────────────────────────────────────────── */

function renderChartsSection(history: InstagramAnalyzerScanHistoryEntry[]): string {
  if (history.length === 0) return '';

  const LIMIT = 15;
  const pts = [...history].reverse().slice(-LIMIT);
  const labels = pts.map((h) => formatDateTime(h.scannedAt).split(',')[0] ?? '');
  const emptyMsg = t('dashboardChartNeedMore');

  const followingFollowersChart = renderLineChart([
    {
      values: pts.map((h) => h.followingCount),
      color: 'var(--c-following)',
      label: t('analyzerFollowingCountLabel')
    },
    {
      values: pts.filter((h) => h.diffs.followersAvailable).map((h) => h.followerCount),
      color: 'var(--c-followers)',
      label: t('analyzerFollowerCountLabel')
    }
  ], labels, emptyMsg);

  const nfChart = renderLineChart([
    {
      values: pts.map((h) => h.nonFollowerCount),
      color: 'var(--c-nonfollowers)',
      label: t('analyzerNonFollowerCountLabel')
    }
  ], labels, emptyMsg);

  return `
    <div class="db-section">
      <div class="db-section-title">${t('dashboardSectionTrends')}</div>
      <div class="db-charts-grid">
        <div class="db-chart-card">
          <div class="db-chart-title">${t('dashboardChartFollowingFollowers')}</div>
          ${followingFollowersChart}
        </div>
        <div class="db-chart-card">
          <div class="db-chart-title">${t('dashboardChartNonFollowers')}</div>
          ${nfChart}
        </div>
      </div>
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Changes Bar Chart Section                                           */
/* ─────────────────────────────────────────────────────────────────── */

function renderChangesChartSection(history: InstagramAnalyzerScanHistoryEntry[]): string {
  if (history.length < 2) return '';

  const LIMIT = 15;
  const pts = [...history].reverse().slice(-LIMIT);

  const groups: BarGroup[] = pts.map((h) => ({
    label: formatDateTime(h.scannedAt).split(',')[0] ?? '',
    bars: [
      { value: h.diffs.followed.length, color: 'var(--c-pos)', label: t('analyzerDiffFollowed') },
      { value: -h.diffs.unfollowed.length, color: 'var(--c-neg)', label: t('analyzerDiffUnfollowed') },
      ...(h.diffs.followersAvailable
        ? [
            { value: h.diffs.followersGained.length, color: 'var(--c-pos-light)', label: t('analyzerDiffFollowersGained') },
            { value: -h.diffs.followersLost.length, color: 'var(--c-neg-light)', label: t('analyzerDiffFollowersLost') }
          ]
        : [])
    ]
  }));

  return `
    <div class="db-section">
      <div class="db-section-title">${t('dashboardSectionChanges')}</div>
      <div class="db-chart-full">
        <div class="db-chart-title">${t('dashboardChangesChartLabel')}</div>
        ${renderBarChart(groups, t('dashboardChartNeedMore'))}
      </div>
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Quick Compare Section                                               */
/* ─────────────────────────────────────────────────────────────────── */

function renderCompareSection(
  state: DashboardState,
  account: InstagramAnalyzerAccountState | null,
  history: InstagramAnalyzerScanHistoryEntry[]
): string {
  if (history.length < 2) {
    return `
      <div class="db-section">
        <div class="db-section-title">${t('dashboardSectionCompare')}</div>
        <div class="db-compare-card">
          <div class="db-compare-empty">${t('dashboardCompareNeedMore')}</div>
        </div>
      </div>
    `;
  }

  const scanB = history.find((h) => h.scanId === state.compareScanBId) ?? history[0]!;
  const scanA = history.find((h) => h.scanId === state.compareScanAId) ??
    history.find((h) => h.scanId !== scanB.scanId) ?? history[1]!;

  const followingDelta = scanB.followingCount - scanA.followingCount;
  const followerDelta = (scanA.diffs.followersAvailable && scanB.diffs.followersAvailable)
    ? scanB.followerCount - scanA.followerCount
    : null;
  const nfDelta = scanB.nonFollowerCount - scanA.nonFollowerCount;

  function metricCard(label: string, valB: number | string, valA: number | string, delta: number | null): string {
    const dSign = delta == null ? '' : delta > 0 ? '+' : '';
    const dClass = delta == null ? '' : delta > 0 ? 'pos' : delta < 0 ? 'neg' : '';
    const dLabel = delta == null ? '' : `<span class="db-compare-metric-delta ${dClass}">${dSign}${delta}</span>`;
    return `
      <div class="db-compare-metric">
        <div class="db-compare-metric-label">${escHtml(label)}</div>
        <div class="db-compare-metric-value">${escHtml(String(valB))}</div>
        <div class="db-compare-metric-was">${t('dashboardCompareWas')} ${escHtml(String(valA))}</div>
        ${dLabel}
      </div>
    `;
  }

  const diffSections = state.compareExpanded ? `
    <div class="db-compare-diff">
      ${renderDiffGroup(t('analyzerDiffFollowed'), scanB.diffs.followed, 'var(--c-pos)')}
      ${renderDiffGroup(t('analyzerDiffUnfollowed'), scanB.diffs.unfollowed, 'var(--c-neg)')}
      ${scanB.diffs.followersAvailable
        ? renderDiffGroup(t('analyzerDiffFollowersGained'), scanB.diffs.followersGained, 'var(--c-followers)') +
          renderDiffGroup(t('analyzerDiffFollowersLost'), scanB.diffs.followersLost, 'var(--c-neg)')
        : ''}
    </div>
  ` : '';

  // Scan picker options
  const scanOptions = history.map((h) =>
    `<option value="${escHtml(h.scanId)}" ${h.scanId === scanB.scanId ? 'selected' : ''}>${escHtml(formatDateTime(h.scannedAt))} — ${t('analyzerHistoryPillNonFollowers')} ${h.nonFollowerCount}</option>`
  ).join('');

  void account;

  return `
    <div class="db-section">
      <div class="db-section-title">${t('dashboardSectionCompare')}</div>
      <div class="db-compare-card">
        <div class="db-compare-header">
          <div class="db-compare-title">${escHtml(formatDateTime(scanA.scannedAt))} → ${escHtml(formatDateTime(scanB.scannedAt))}</div>
          <select class="db-list-source-select" data-action="compare-pick-b" style="font-size:11px;height:28px;">
            ${scanOptions}
          </select>
        </div>
        <div class="db-compare-metrics">
          ${metricCard(t('analyzerFollowingCountLabel'), scanB.followingCount, scanA.followingCount, followingDelta)}
          ${metricCard(t('analyzerFollowerCountLabel'),
            scanB.diffs.followersAvailable ? scanB.followerCount : '—',
            scanA.diffs.followersAvailable ? scanA.followerCount : '—',
            followerDelta)}
          ${metricCard(t('analyzerNonFollowerCountLabel'), scanB.nonFollowerCount, scanA.nonFollowerCount, nfDelta)}
        </div>
        <div class="db-compare-summary">
          <span class="db-compare-summary-item">
            <span class="db-compare-summary-val pos">+${scanB.diffs.followed.length}</span>
            <span>${t('analyzerDiffFollowed')}</span>
          </span>
          <span class="db-compare-summary-item">
            <span class="db-compare-summary-val neg">-${scanB.diffs.unfollowed.length}</span>
            <span>${t('analyzerDiffUnfollowed')}</span>
          </span>
          ${scanB.diffs.followersAvailable ? `
            <span class="db-compare-summary-item">
              <span class="db-compare-summary-val pos">+${scanB.diffs.followersGained.length}</span>
              <span>${t('analyzerDiffFollowersGained')}</span>
            </span>
            <span class="db-compare-summary-item">
              <span class="db-compare-summary-val neg">-${scanB.diffs.followersLost.length}</span>
              <span>${t('analyzerDiffFollowersLost')}</span>
            </span>
          ` : ''}
        </div>
        <div class="db-compare-expand-row">
          <button class="db-btn" type="button" data-action="toggle-compare-expand">
            ${state.compareExpanded ? t('dashboardCompareHide') : t('dashboardCompareShow')}
          </button>
        </div>
        ${diffSections}
      </div>
    </div>
  `;
}

function renderDiffGroup(label: string, users: InstagramAnalyzerSnapshotUser[], _color: string): string {
  if (!users.length) return '';
  return `
    <div>
      <div class="db-compare-diff-label">${escHtml(label)} (${users.length})</div>
      <div class="db-diff-list">
        ${users.slice(0, 30).map((u) => `
          <div class="db-diff-item">
            <a href="https://www.instagram.com/${encodeURIComponent(u.username)}/" target="_blank" rel="noopener noreferrer">@${escHtml(u.username)}</a>
          </div>
        `).join('')}
        ${users.length > 30 ? `<div style="padding:6px 10px;font-size:11px;color:var(--text-3)">+${users.length - 30} ${t('dashboardMore')}</div>` : ''}
      </div>
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────────────── */
/* User List Section                                                   */
/* ─────────────────────────────────────────────────────────────────── */

function renderListSection(
  state: DashboardState,
  account: InstagramAnalyzerAccountState | null,
  isUnfollowPending: (id: string) => boolean
): string {
  const allItems = getListItems(state.listSource, account);
  const filtered = filterListItems(allItems, state.listSearchQuery, state.listSource, account?.whitelist ?? []);
  const totalPages = Math.max(1, Math.ceil(filtered.length / LIST_PAGE_SIZE));
  const page = Math.min(Math.max(1, state.listPage), totalPages);
  const pageItems = filtered.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE);
  const whitelistSet = new Set(account?.whitelist ?? []);

  const sourceOptions: Array<{ value: ListSource; label: string }> = [
    { value: 'non-followers', label: t('dashboardListNonFollowers') },
    { value: 'whitelist', label: t('analyzerTabWhitelisted') },
    { value: 'following', label: t('dashboardListFollowing') },
    { value: 'followers', label: t('dashboardListFollowers') }
  ];

  const sourceSelect = sourceOptions.map((opt) =>
    `<option value="${opt.value}" ${state.listSource === opt.value ? 'selected' : ''}>${escHtml(opt.label)}</option>`
  ).join('');

  const listHtml = pageItems.length === 0
    ? `<div class="db-list-empty">${allItems.length === 0 ? t('analyzerResultsEmpty') : t('dashboardListNoResults')}</div>`
    : pageItems.map((item) => {
        const isResult = 'fullName' in item;
        const username = item.username;
        const fullName = isResult ? (item as InstagramAnalyzerResultItem).fullName : '';
        const isPrivate = isResult ? (item as InstagramAnalyzerResultItem).isPrivate : false;
        const isVerified = isResult ? (item as InstagramAnalyzerResultItem).isVerified : false;
        const avatarUrl = isResult ? (item as InstagramAnalyzerResultItem).profilePictureUrl : '';
        const itemId = item.id;
        const isWl = whitelistSet.has(itemId);
        const unfollowPending = isUnfollowPending(itemId);

        const avatarContent = avatarUrl
          ? `<img src="${escHtml(avatarUrl)}" alt="${escHtml(username)}" loading="lazy" />`
          : escHtml(username.slice(0, 1).toUpperCase());

        return `
          <div class="db-list-item">
            <div class="db-list-avatar">${avatarContent}</div>
            <div class="db-list-user">
              <a class="db-list-username" href="https://www.instagram.com/${encodeURIComponent(username)}/" target="_blank" rel="noopener noreferrer">@${escHtml(username)}</a>
              ${fullName ? `<span class="db-list-fullname">${escHtml(fullName)}</span>` : ''}
            </div>
            <div class="db-list-badges">
              ${isPrivate ? `<span class="db-mini-badge">${t('analyzerPrivateBadge')}</span>` : ''}
              ${isVerified ? `<span class="db-mini-badge">${t('analyzerVerifiedBadge')}</span>` : ''}
            </div>
            <button class="db-unfollow-btn" type="button" data-action="unfollow" data-id="${escHtml(itemId)}" title="${escHtml(t('analyzerUnfollowTitle'))}" ${unfollowPending ? 'disabled' : ''}>
              ${t('analyzerUnfollow')}
            </button>
            <button class="db-wl-btn" type="button" data-action="toggle-wl" data-id="${escHtml(itemId)}" data-active="${String(isWl)}" title="${escHtml(isWl ? t('analyzerWhitelistRemove') : t('analyzerWhitelistAdd'))}">
              ${isWl ? '★' : '☆'}
            </button>
          </div>
        `;
      }).join('');

  return `
    <div class="db-section">
      <div class="db-section-title">${t('dashboardSectionList')}</div>
      <div class="db-list-card">
        <div class="db-list-header">
          <select class="db-list-source-select" data-action="change-list-source">
            ${sourceSelect}
          </select>
          <input class="db-list-search" type="search" value="${escHtml(state.listSearchQuery)}" placeholder="${escHtml(t('analyzerSearchPlaceholder'))}" data-action="list-search" />
          <span class="db-list-count">${filtered.length} ${t('dashboardListTotal')}</span>
        </div>
        <div class="db-list-items">${listHtml}</div>
        <div class="db-list-footer">
          <div class="db-list-pagination">
            <button class="db-btn" type="button" data-action="list-prev" ${page <= 1 ? 'disabled' : ''}>←</button>
            <span class="db-page-indicator">${page} / ${totalPages}</span>
            <button class="db-btn" type="button" data-action="list-next" ${page >= totalPages ? 'disabled' : ''}>→</button>
          </div>
          <div class="db-list-actions">
            <button class="db-btn" type="button" data-action="copy-list" ${filtered.length === 0 ? 'disabled' : ''}>${t('analyzerCopyVisible')}</button>
            <button class="db-btn" type="button" data-action="export-list" ${filtered.length === 0 ? 'disabled' : ''}>${t('dashboardExportCsv')}</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function getListItems(
  source: ListSource,
  account: InstagramAnalyzerAccountState | null
): Array<InstagramAnalyzerResultItem | InstagramAnalyzerSnapshotUser> {
  if (!account) return [];
  const whitelistSet = new Set(account.whitelist);

  switch (source) {
    case 'non-followers': return account.results;
    case 'whitelist': return account.results.filter((r) => whitelistSet.has(r.id));
    case 'following': return account.followingSnapshot;
    case 'followers': return account.followersSnapshot;
    default: return account.results;
  }
}

function isRichListItem(
  item: InstagramAnalyzerResultItem | InstagramAnalyzerSnapshotUser
): item is InstagramAnalyzerResultItem {
  return 'fullName' in item;
}

function getListSourceLabel(source: ListSource): string {
  switch (source) {
    case 'whitelist':
      return t('analyzerTabWhitelisted');
    case 'following':
      return t('dashboardListFollowing');
    case 'followers':
      return t('dashboardListFollowers');
    case 'non-followers':
    default:
      return t('dashboardListNonFollowers');
  }
}

function filterListItems(
  items: Array<InstagramAnalyzerResultItem | InstagramAnalyzerSnapshotUser>,
  query: string,
  _source: ListSource,
  _whitelist: string[]
): Array<InstagramAnalyzerResultItem | InstagramAnalyzerSnapshotUser> {
  if (!query.trim()) return items;
  const q = normalizeText(query.trim());
  return items.filter((item) => {
    if (normalizeText(item.username).includes(q)) return true;
    if ('fullName' in item && normalizeText((item as InstagramAnalyzerResultItem).fullName).includes(q)) return true;
    return false;
  });
}

/* ─────────────────────────────────────────────────────────────────── */
/* Scan History Section                                               */
/* ─────────────────────────────────────────────────────────────────── */

function renderHistorySection(
  state: DashboardState,
  history: InstagramAnalyzerScanHistoryEntry[]
): string {
  if (history.length === 0) {
    return `
      <div class="db-section">
        <div class="db-section-title">${t('dashboardSectionHistory')}</div>
        <div class="db-history-card">
          <div class="db-list-empty">${t('analyzerHistoryEmpty')}</div>
        </div>
      </div>
    `;
  }

  const rows = history.map((entry) => {
    const isExpanded = state.historyExpandedScanId === entry.scanId;

    const detailHtml = isExpanded ? `
      <div class="db-history-detail">
        <div class="db-history-detail-grid">
          <div class="db-history-stat">
            <span class="db-history-stat-k">${t('analyzerFollowingCountLabel')}</span>
            <span class="db-history-stat-v">${entry.followingCount}</span>
          </div>
          <div class="db-history-stat">
            <span class="db-history-stat-k">${t('analyzerFollowerCountLabel')}</span>
            <span class="db-history-stat-v">${entry.diffs.followersAvailable ? entry.followerCount : '—'}</span>
          </div>
          <div class="db-history-stat">
            <span class="db-history-stat-k">${t('analyzerNonFollowerCountLabel')}</span>
            <span class="db-history-stat-v">${entry.nonFollowerCount}</span>
          </div>
          <div class="db-history-stat">
            <span class="db-history-stat-k">${t('analyzerPagesLabel')}</span>
            <span class="db-history-stat-v">${entry.pagesCompleted}</span>
          </div>
          <div class="db-history-stat">
            <span class="db-history-stat-k">${t('analyzerDiffFollowed')}</span>
            <span class="db-history-stat-v" style="color:var(--c-pos)">+${entry.diffs.followed.length}</span>
          </div>
          <div class="db-history-stat">
            <span class="db-history-stat-k">${t('analyzerDiffUnfollowed')}</span>
            <span class="db-history-stat-v" style="color:var(--c-neg)">-${entry.diffs.unfollowed.length}</span>
          </div>
          ${entry.diffs.followersAvailable ? `
            <div class="db-history-stat">
              <span class="db-history-stat-k">${t('analyzerDiffFollowersGained')}</span>
              <span class="db-history-stat-v" style="color:var(--c-followers)">+${entry.diffs.followersGained.length}</span>
            </div>
            <div class="db-history-stat">
              <span class="db-history-stat-k">${t('analyzerDiffFollowersLost')}</span>
              <span class="db-history-stat-v" style="color:var(--c-neg)">-${entry.diffs.followersLost.length}</span>
            </div>
          ` : ''}
        </div>
        <div class="db-history-detail-actions">
          <button class="db-btn db-btn-primary" type="button" data-action="compare-from-history" data-scan-id="${escHtml(entry.scanId)}">${t('dashboardCompareFromHistory')}</button>
        </div>
      </div>
    ` : '';

    return `
      <div class="db-history-row" data-expanded="${String(isExpanded)}" data-action="toggle-history" data-scan-id="${escHtml(entry.scanId)}" tabindex="0" role="button">
        <div class="db-history-row-main">
          <div class="db-history-row-date">${escHtml(formatDateTime(entry.scannedAt))}</div>
          <div class="db-history-row-meta">
            <span>${t('analyzerFollowingCountLabel')}: ${entry.followingCount}</span>
            <span>${t('analyzerNonFollowerCountLabel')}: ${entry.nonFollowerCount}</span>
          </div>
        </div>
        <div class="db-history-pills">
          <span class="db-history-pill" title="${escHtml(t('analyzerHistoryTooltipFollowed'))}">${t('analyzerHistoryPillFollowed')} ${entry.diffs.followed.length}</span>
          <span class="db-history-pill" title="${escHtml(t('analyzerHistoryTooltipUnfollowed'))}">${t('analyzerHistoryPillUnfollowed')} ${entry.diffs.unfollowed.length}</span>
          ${entry.diffs.followersAvailable
            ? `<span class="db-history-pill" title="${escHtml(t('analyzerHistoryTooltipFollowersGained'))}">${t('analyzerHistoryPillFollowersGained')} ${entry.diffs.followersGained.length}</span>
               <span class="db-history-pill" title="${escHtml(t('analyzerHistoryTooltipFollowersLost'))}">${t('analyzerHistoryPillFollowersLost')} ${entry.diffs.followersLost.length}</span>`
            : ''}
        </div>
        <span class="db-history-expand-icon">▶</span>
      </div>
      ${detailHtml}
    `;
  }).join('');

  return `
    <div class="db-section">
      <div class="db-section-title">${t('dashboardSectionHistory')}</div>
      <div class="db-history-card">
        <div class="db-history-header">
          <div class="db-history-header-title">${t('dashboardSectionHistory')} (${history.length})</div>
        </div>
        ${rows}
      </div>
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Dashboard Controller                                                */
/* ─────────────────────────────────────────────────────────────────── */

export function openDashboard(
  activeViewerId: string | null,
  activeUsername: string,
  initialAnalyzerState: InstagramAnalyzerState,
  themeChoice: ThemeChoice,
  onClose: () => void,
  onScan: () => void,
  onToggleWhitelist: (id: string) => void,
  onUnfollow: (id: string) => void,
  isUnfollowPending: (id: string) => boolean
): () => void {
  // Remove existing instance
  const existing = document.getElementById(DASHBOARD_HOST_ID);
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = DASHBOARD_HOST_ID;
  (document.body || document.documentElement).appendChild(host);
  const shadowRoot = host.attachShadow({ mode: 'open' });

  const state: DashboardState = {
    analyzerState: initialAnalyzerState,
    activeViewerId,
    activeUsername,
    listSource: 'non-followers',
    listSearchQuery: '',
    listPage: 1,
    compareExpanded: false,
    compareScanAId: null,
    compareScanBId: null,
    historyExpandedScanId: null,
    isDisposed: false
  };

  // Shadow root container
  const wrapper = document.createElement('div');
  wrapper.className = 'db-root';
  wrapper.setAttribute('data-theme', resolveTheme(themeChoice));
  shadowRoot.appendChild(wrapper);

  // Style
  const styleEl = document.createElement('style');
  styleEl.textContent = DASHBOARD_CSS;
  shadowRoot.insertBefore(styleEl, wrapper);

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'db-backdrop';
  wrapper.appendChild(backdrop);

  // Panel
  const panel = document.createElement('div');
  panel.className = 'db-panel';
  wrapper.appendChild(panel);

  let listSearchInput: HTMLInputElement | null = null;
  let listScrollTop = 0;

  // ── Hover Card ──────────────────────────────────────────────────────
  const hoverCard = document.createElement('div');
  hoverCard.className = 'db-hover-card';
  wrapper.appendChild(hoverCard);

  let hoverHideTimer = 0;
  let hoverShowTimer = 0;
  let hoverCurrentId = '';
  let hoverAnchorEl: HTMLElement | null = null;
  let hoverRafId = 0;

  // Continuously track anchor position via rAF while card is visible
  function startAnchorTracking(): void {
    window.cancelAnimationFrame(hoverRafId);
    function tick(): void {
      if (!hoverAnchorEl || !hoverCard.classList.contains('db-hover-card--visible')) return;
      positionHoverCard(hoverAnchorEl);
      hoverRafId = window.requestAnimationFrame(tick);
    }
    hoverRafId = window.requestAnimationFrame(tick);
  }

  function stopAnchorTracking(): void {
    window.cancelAnimationFrame(hoverRafId);
    hoverRafId = 0;
  }

  function showHoverCard(
    item: InstagramAnalyzerResultItem | InstagramAnalyzerSnapshotUser,
    anchorEl: HTMLElement,
    whitelistSet: Set<string>,
    relationState: {
      followingIds: Set<string>;
      followerIds: Set<string>;
      nonFollowerIds: Set<string>;
    }
  ): void {
    window.clearTimeout(hoverHideTimer);
    window.clearTimeout(hoverShowTimer);

    const id = item.id;
    if (hoverCurrentId === id && hoverCard.classList.contains('db-hover-card--visible')) return;
    hoverCurrentId = id;

    const isResult = isRichListItem(item);
    const username = item.username;
    const fullName = isResult ? item.fullName : '';
    const isPrivate = isResult ? item.isPrivate : false;
    const isVerified = isResult ? item.isVerified : false;
    const avatarUrl = isResult ? item.profilePictureUrl : '';
    const isWl = whitelistSet.has(id);
    const profileUrl = `https://www.instagram.com/${encodeURIComponent(username)}/`;
    const unfollowPending = isUnfollowPending(id);
    const followingLabel = relationState.followingIds.has(id) ? t('analyzerHoverYes') : t('analyzerHoverNo');
    const followerLabel = relationState.followerIds.has(id) ? t('analyzerHoverYes') : t('analyzerHoverNo');
    const followsBackLabel = relationState.nonFollowerIds.has(id) ? t('analyzerHoverNo') : t('analyzerHoverYes');

    const avatarInitial = username.slice(0, 1).toUpperCase();
    const avatarContent = avatarUrl
      ? `<img src="${escHtml(avatarUrl)}" alt="${escHtml(username)}" crossorigin="anonymous" />`
      : avatarInitial;

    // Verified SVG (Instagram blue check, simplified)
    const verifiedSvg = isVerified
      ? `<svg class="db-hover-verified-icon" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-label="${escHtml(t('analyzerVerifiedBadge'))}">
           <path d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Zm7.415 11.225 2.254 2.287-11.43 11.5-6.835-6.93 2.244-2.258 4.587 4.581 9.18-9.18Z" fill-rule="evenodd"/>
         </svg>`
      : '';

    const tagsHtml = [
      isWl ? `<span class="db-hover-tag db-hover-tag--wl">★ ${escHtml(t('analyzerTabWhitelisted'))}</span>` : '',
      unfollowPending ? `<span class="db-hover-tag db-hover-tag--pending">${escHtml(t('analyzerHoverPending'))}</span>` : '',
      isPrivate ? `<span class="db-hover-tag db-hover-tag--prv">${escHtml(t('analyzerPrivateBadge'))}</span>` : '',
      !isPrivate ? `<span class="db-hover-tag">${escHtml(t('analyzerHoverPublic'))}</span>` : ''
    ].filter(Boolean).join('');

    const relationSummary = relationState.nonFollowerIds.has(id)
      ? t('dashboardListNonFollowers')
      : relationState.followingIds.has(id) && relationState.followerIds.has(id)
        ? `${t('analyzerHoverFollowing')} + ${t('analyzerHoverFollower')}`
        : relationState.followingIds.has(id)
          ? t('analyzerHoverFollowing')
          : relationState.followerIds.has(id)
            ? t('analyzerHoverFollower')
            : getListSourceLabel(state.listSource);

    hoverCard.innerHTML = `
      <div class="db-hover-hero">
        <div class="db-hover-top">
          <div class="db-hover-avatar">${avatarContent}</div>
          <div class="db-hover-identity">
            <div class="db-hover-name-row">
              <span class="db-hover-username">@${escHtml(username)}</span>
              ${verifiedSvg}
            </div>
            ${fullName ? `<div class="db-hover-fullname">${escHtml(fullName)}</div>` : ''}
            ${tagsHtml ? `<div class="db-hover-tags">${tagsHtml}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="db-hover-summary">
        <span class="db-hover-summary-strong">${escHtml(relationSummary)}</span>
        ${fullName ? '' : ` · ${escHtml(isResult ? t('analyzerHoverDataRich') : t('analyzerHoverDataLimited'))}`}
      </div>
      <div class="db-hover-stats">
        <div class="db-hover-stat">
          <span class="db-hover-stat-label">${escHtml(t('analyzerHoverFollowing'))}</span>
          <span class="db-hover-stat-value">${escHtml(followingLabel)}</span>
        </div>
        <div class="db-hover-stat">
          <span class="db-hover-stat-label">${escHtml(t('analyzerHoverFollower'))}</span>
          <span class="db-hover-stat-value">${escHtml(followerLabel)}</span>
        </div>
        <div class="db-hover-stat">
          <span class="db-hover-stat-label">${escHtml(t('analyzerHoverNonFollower'))}</span>
          <span class="db-hover-stat-value">${escHtml(followsBackLabel)}</span>
        </div>
      </div>
      <div class="db-hover-actions">
        <a class="db-hover-btn db-hover-btn--profile" href="${escHtml(profileUrl)}" target="_blank" rel="noopener noreferrer" title="${escHtml(t('analyzerOpenProfileTitle'))}">
          ${escHtml(t('analyzerOpenProfile'))}
        </a>
        <button class="db-hover-btn ${isWl ? 'db-hover-btn--wl-active' : ''}" type="button" data-hover-wl="${escHtml(id)}" title="${escHtml(isWl ? t('analyzerWhitelistRemove') : t('analyzerWhitelistAdd'))}">
          ${escHtml(t('analyzerWhitelistShort'))}
        </button>
        <button class="db-hover-btn db-hover-btn--danger" type="button" data-hover-unfollow="${escHtml(id)}" ${unfollowPending ? 'disabled' : ''}>
          ${t('analyzerUnfollow')}
        </button>
      </div>
    `;

    // Avatar image error fallback → show initial letter
    if (avatarUrl) {
      const imgEl = hoverCard.querySelector<HTMLImageElement>('.db-hover-avatar img');
      const avatarEl = hoverCard.querySelector<HTMLElement>('.db-hover-avatar');
      if (imgEl && avatarEl) {
        imgEl.addEventListener('error', () => {
          imgEl.remove();
          avatarEl.textContent = avatarInitial;
        });
      }
    }

    // Wire whitelist button
    const wlBtn = hoverCard.querySelector<HTMLButtonElement>('[data-hover-wl]');
    wlBtn?.addEventListener('click', () => {
      onToggleWhitelist(id);
      hideHoverCard(true);
    });

    const unfollowBtn = hoverCard.querySelector<HTMLButtonElement>('[data-hover-unfollow]');
    unfollowBtn?.addEventListener('click', () => {
      onUnfollow(id);
      hideHoverCard(true);
    });

    // Position then reveal
    hoverAnchorEl = anchorEl;
    const fromBottom = positionHoverCard(anchorEl);
    hoverCard.classList.remove('db-hover-card--from-bottom', 'db-hover-card--from-top', 'db-hover-card--visible');
    hoverCard.classList.add(fromBottom ? 'db-hover-card--from-bottom' : 'db-hover-card--from-top');

    hoverShowTimer = window.setTimeout(() => {
      hoverCard.classList.add('db-hover-card--visible');
      startAnchorTracking();
    }, 10);
  }

  /** Returns true if card opens downward (from-bottom), false if upward (from-top). */
  function positionHoverCard(anchorEl: HTMLElement): boolean {
    const panelRect = panel.getBoundingClientRect();
    const anchorRect = anchorEl.getBoundingClientRect();
    const cardW = hoverCard.offsetWidth || 312;
    const cardH = hoverCard.offsetHeight || 220;

    // Horizontal: align left edge of card with left edge of anchor row
    let left = anchorRect.left;
    if (left + cardW > panelRect.right - 8) {
      left = panelRect.right - cardW - 8;
    }
    left = Math.max(panelRect.left + 8, left);

    // Vertical: prefer below anchor (top of card = bottom of anchor)
    const spaceBelow = panelRect.bottom - anchorRect.bottom;
    const spaceAbove = anchorRect.top - panelRect.top;
    let top: number;
    let fromBottom: boolean;

    if (spaceBelow >= cardH + 6 || spaceBelow >= spaceAbove) {
      top = anchorRect.bottom;
      fromBottom = true;
    } else {
      top = anchorRect.top - cardH;
      fromBottom = false;
    }

    top = Math.max(panelRect.top + 8, Math.min(panelRect.bottom - cardH - 8, top));

    hoverCard.style.left = `${left}px`;
    hoverCard.style.top  = `${top}px`;
    return fromBottom;
  }

  function hideHoverCard(immediate = false): void {
    window.clearTimeout(hoverShowTimer);
    if (immediate) {
      stopAnchorTracking();
      hoverCard.classList.remove('db-hover-card--visible');
      hoverCurrentId = '';
      hoverAnchorEl = null;
      return;
    }
    hoverHideTimer = window.setTimeout(() => {
      stopAnchorTracking();
      hoverCard.classList.remove('db-hover-card--visible');
      hoverCurrentId = '';
      hoverAnchorEl = null;
    }, 200);
  }

  // Keep card alive when hovering over it
  hoverCard.addEventListener('mouseenter', () => {
    window.clearTimeout(hoverHideTimer);
  });
  hoverCard.addEventListener('mouseleave', () => {
    hideHoverCard();
  });

  function close(): void {
    if (state.isDisposed) return;
    state.isDisposed = true;
    chrome.storage.onChanged.removeListener(handleStorageChange);
    host.remove();
    onClose();
  }

  function render(): void {
    if (state.isDisposed) return;

    const account = resolveAccount(state.analyzerState, state.activeViewerId);
    const username = state.activeUsername || account?.summary.username || '';
    const profileUrl = username
      ? `https://www.instagram.com/${encodeURIComponent(username)}/`
      : 'https://www.instagram.com/';

    const lastScanLabel = account?.summary.lastScannedAt
      ? t('analyzerLastScan').replace('{time}', formatRelativeTime(account.summary.lastScannedAt))
      : t('analyzerLastScanNever');

    const isRunning = account?.job?.status === 'running' || account?.summary.status === 'running';
    const scanLabel = isRunning
      ? t('analyzerScanRunning')
      : account?.summary.lastScannedAt
        ? t('analyzerScanRescan')
        : t('analyzerScanStart');

    // Capture scroll position
    const bodyEl = panel.querySelector('.db-body') as HTMLElement | null;
    const prevBodyScroll = bodyEl?.scrollTop ?? 0;
    const prevListSearch = (panel.querySelector('.db-list-search') as HTMLInputElement | null)?.value ?? '';
    const searchFocused = shadowRoot.activeElement?.getAttribute('data-action') === 'list-search';
    const listEl = panel.querySelector('.db-list-items') as HTMLElement | null;
    listScrollTop = listEl?.scrollTop ?? listScrollTop;

    panel.innerHTML = `
      <div class="db-header">
        <div class="db-header-account">
          <a class="db-account-link" href="${escHtml(profileUrl)}" target="_blank" rel="noopener noreferrer">@${escHtml(username || t('analyzerUnknownAccount'))}</a>
          <div class="db-last-scan">${escHtml(lastScanLabel)}</div>
        </div>
        <div class="db-header-actions">
          <button class="db-btn db-btn-primary" type="button" data-action="scan" ${isRunning || !state.activeViewerId ? 'disabled' : ''}>${escHtml(scanLabel)}</button>
          <button class="db-btn db-btn-close" type="button" data-action="close" aria-label="${t('analyzerDrawerClose')}">✕</button>
        </div>
      </div>
      <div class="db-body">
        ${renderDashboard(state, account, isUnfollowPending)}
      </div>
    `;

    // Restore scroll
    const newBodyEl = panel.querySelector('.db-body') as HTMLElement | null;
    if (newBodyEl) newBodyEl.scrollTop = prevBodyScroll;

    // Restore search input state
    listSearchInput = panel.querySelector('.db-list-search') as HTMLInputElement | null;
    if (listSearchInput && listSearchInput.value !== prevListSearch) {
      listSearchInput.value = prevListSearch;
    }
    if (searchFocused && listSearchInput) {
      listSearchInput.focus();
    }

    attachEvents();
  }

  function attachEvents(): void {
    // Close
    panel.querySelector('[data-action="close"]')?.addEventListener('click', close);
    backdrop.addEventListener('click', close, { once: false });

    // Scan
    panel.querySelector('[data-action="scan"]')?.addEventListener('click', onScan);

    // List source change
    const sourceSelect = panel.querySelector('[data-action="change-list-source"]') as HTMLSelectElement | null;
    sourceSelect?.addEventListener('change', () => {
      state.listSource = (sourceSelect.value as ListSource) || 'non-followers';
      state.listPage = 1;
      state.listSearchQuery = '';
      render();
    });

    // List search
    listSearchInput?.addEventListener('input', () => {
      state.listSearchQuery = listSearchInput?.value ?? '';
      state.listPage = 1;
      render();
    });

    // Prevent Instagram from capturing keyboard inside shadow root
    listSearchInput?.addEventListener('keydown', (e) => { e.stopPropagation(); }, true);
    listSearchInput?.addEventListener('keypress', (e) => { e.stopPropagation(); }, true);
    listSearchInput?.addEventListener('keyup', (e) => { e.stopPropagation(); }, true);

    // List pagination
    panel.querySelector('[data-action="list-prev"]')?.addEventListener('click', () => {
      state.listPage = Math.max(1, state.listPage - 1);
      render();
    });
    panel.querySelector('[data-action="list-next"]')?.addEventListener('click', () => {
      state.listPage++;
      render();
    });

    // Copy list
    panel.querySelector('[data-action="copy-list"]')?.addEventListener('click', async () => {
      const account = resolveAccount(state.analyzerState, state.activeViewerId);
      const items = filterListItems(
        getListItems(state.listSource, account),
        state.listSearchQuery,
        state.listSource,
        account?.whitelist ?? []
      );
      if (!items.length) return;
      const text = items.map((i) => `@${i.username}`).join('\n');
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;opacity:0;';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
      } catch { /* noop */ }
    });

    // Export list as CSV
    panel.querySelector('[data-action="export-list"]')?.addEventListener('click', () => {
      const account = resolveAccount(state.analyzerState, state.activeViewerId);
      const items = filterListItems(
        getListItems(state.listSource, account),
        state.listSearchQuery,
        state.listSource,
        account?.whitelist ?? []
      );
      if (!items.length) return;
      const header = 'username,id';
      const rows = items.map((i) => `${i.username},${i.id}`);
      const csv = [header, ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const label = (state.activeUsername || 'instagram').replace(/[^a-z0-9_-]/gi, '-');
      a.href = url;
      a.download = `instagram-${state.listSource}-${label}.csv`;
      a.click();
      globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    // Whitelist toggles
    panel.querySelectorAll<HTMLButtonElement>('[data-action="toggle-wl"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset['id'];
        if (id) onToggleWhitelist(id);
      });
    });

    panel.querySelectorAll<HTMLButtonElement>('[data-action="unfollow"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset['id'];
        if (id) onUnfollow(id);
      });
    });

    // Hover card on list items
    const account = resolveAccount(state.analyzerState, state.activeViewerId);
    const whitelistSet = new Set(account?.whitelist ?? []);
    const relationState = {
      followingIds: new Set(account?.followingSnapshot.map((entry) => entry.id) ?? []),
      followerIds: new Set(account?.followersSnapshot.map((entry) => entry.id) ?? []),
      nonFollowerIds: new Set(account?.results.map((entry) => entry.id) ?? [])
    };
    const allListItems = [
      ...getListItems(state.listSource, account),
      ...getListItems('non-followers', account),
      ...getListItems('whitelist', account),
      ...getListItems('following', account),
      ...getListItems('followers', account)
    ];
    const itemById = new Map<string, InstagramAnalyzerResultItem | InstagramAnalyzerSnapshotUser>();
    allListItems.forEach((it) => {
      const existing = itemById.get(it.id);
      if (!existing || (isRichListItem(it) && !isRichListItem(existing))) {
        itemById.set(it.id, it);
      }
    });

    panel.querySelectorAll<HTMLElement>('.db-list-item').forEach((row) => {
      const wlBtn = row.querySelector<HTMLButtonElement>('[data-action="toggle-wl"]');
      const itemId = wlBtn?.dataset['id'];
      if (!itemId) return;
      const item = itemById.get(itemId);
      if (!item) return;

      // Only trigger on the username link, not the whole row
      const usernameEl = row.querySelector<HTMLElement>('.db-list-username');
      if (!usernameEl) return;

      usernameEl.addEventListener('mouseenter', () => {
        showHoverCard(item, usernameEl, whitelistSet, relationState);
      });
      usernameEl.addEventListener('focus', () => {
        showHoverCard(item, usernameEl, whitelistSet, relationState);
      });
      usernameEl.addEventListener('mouseleave', (e) => {
        const to = e.relatedTarget as Node | null;
        if (hoverCard.contains(to)) return;
        hideHoverCard();
      });
      usernameEl.addEventListener('blur', (e) => {
        const to = e.relatedTarget as Node | null;
        if (hoverCard.contains(to)) return;
        hideHoverCard();
      });
    });

    // Compare expand
    panel.querySelector('[data-action="toggle-compare-expand"]')?.addEventListener('click', () => {
      state.compareExpanded = !state.compareExpanded;
      render();
    });

    // Compare pick scan B
    const comparePick = panel.querySelector('[data-action="compare-pick-b"]') as HTMLSelectElement | null;
    comparePick?.addEventListener('change', () => {
      state.compareScanBId = comparePick.value || null;
      state.compareScanAId = null;
      state.compareExpanded = false;
      render();
    });

    // History toggle
    panel.querySelectorAll<HTMLElement>('[data-action="toggle-history"]').forEach((row) => {
      const handler = (): void => {
        const scanId = row.dataset['scanId'] ?? null;
        state.historyExpandedScanId = state.historyExpandedScanId === scanId ? null : scanId;
        render();
      };
      row.addEventListener('click', handler);
      row.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
      });
    });

    // Compare from history
    panel.querySelectorAll<HTMLButtonElement>('[data-action="compare-from-history"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.compareScanBId = btn.dataset['scanId'] ?? null;
        state.compareScanAId = null;
        state.compareExpanded = true;
        const bodyEl = panel.querySelector('.db-body') as HTMLElement | null;
        if (bodyEl) {
          // Scroll to compare section (approximate)
          const compareCard = panel.querySelector('.db-compare-card') as HTMLElement | null;
          if (compareCard) {
            const bodyRect = bodyEl.getBoundingClientRect();
            const cardRect = compareCard.getBoundingClientRect();
            bodyEl.scrollTop += cardRect.top - bodyRect.top - 24;
          }
        }
        render();
      });
    });

    // Keyboard shortcut: Esc to close
    document.addEventListener('keydown', handleKeyDown, { capture: true });
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  }

  const handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area !== 'local') return;
    if (changes['instagramAnalyzer']) {
      void (async () => {
        try {
          state.analyzerState = await getInstagramAnalyzerState();
          const account = resolveAccount(state.analyzerState, state.activeViewerId);
          if (!account?.results.length && state.activeViewerId) {
            // Hydrate durable data
            const response = await sendDashboardMessage({
              type: MESSAGE_TYPES.IG_ANALYZER_GET_DURABLE_ACCOUNT,
              viewerId: state.activeViewerId
            });
            if (response?.success) {
              const durable = response['account'] as InstagramAnalyzerDurableAccount | undefined;
              if (durable && state.analyzerState.accounts[state.activeViewerId]) {
                const acc = state.analyzerState.accounts[state.activeViewerId]!;
                acc.results = durable.results;
                acc.history = durable.history;
                acc.followingSnapshot = durable.followingSnapshot;
                acc.followersSnapshot = durable.followersSnapshot;
              }
            }
          }
          render();
        } catch (error) {
          if (!isContextInvalidatedError(error)) throw error;
        }
      })();
    }
    if (changes['theme']) {
      wrapper.setAttribute('data-theme', resolveTheme(changes['theme'].newValue as ThemeChoice ?? 'system'));
    }
  };

  chrome.storage.onChanged.addListener(handleStorageChange);

  // Initial render
  render();

  // Hydrate durable data immediately
  if (activeViewerId) {
    void (async () => {
      try {
        const response = await sendDashboardMessage({
          type: MESSAGE_TYPES.IG_ANALYZER_GET_DURABLE_ACCOUNT,
          viewerId: activeViewerId
        });
        if (response?.success && !state.isDisposed) {
          const durable = response['account'] as InstagramAnalyzerDurableAccount | undefined;
          if (durable && state.analyzerState.accounts[activeViewerId]) {
            const acc = state.analyzerState.accounts[activeViewerId]!;
            if (!acc.results.length) acc.results = durable.results;
            if (!acc.history.length) acc.history = durable.history;
            if (!acc.followingSnapshot.length) acc.followingSnapshot = durable.followingSnapshot;
            if (!acc.followersSnapshot.length) acc.followersSnapshot = durable.followersSnapshot;
            render();
          }
        }
      } catch { /* noop */ }
    })();
  }

  // Apply latest settings
  void (async () => {
    try {
      const settings = await getSettings();
      if (!state.isDisposed) {
        wrapper.setAttribute('data-theme', resolveTheme(settings.theme));
        // Re-render so i18n is fresh
        render();
      }
    } catch { /* noop */ }
  })();

  return close;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Standalone toggle helper (called from index.ts launcher)           */
/* ─────────────────────────────────────────────────────────────────── */

let closeDashboard: (() => void) | null = null;

export function toggleDashboard(params: {
  activeViewerId: string | null;
  activeUsername: string;
  analyzerState: InstagramAnalyzerState;
  themeChoice: ThemeChoice;
  onScan: () => void;
  onToggleWhitelist: (id: string) => void;
  onUnfollow: (id: string) => void;
  isUnfollowPending: (id: string) => boolean;
}): void {
  if (closeDashboard) {
    closeDashboard();
    closeDashboard = null;
    return;
  }

  closeDashboard = openDashboard(
    params.activeViewerId,
    params.activeUsername,
    params.analyzerState,
    params.themeChoice,
    () => { closeDashboard = null; },
    params.onScan,
    params.onToggleWhitelist,
    params.onUnfollow,
    params.isUnfollowPending
  );
}
