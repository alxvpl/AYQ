import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Badge, Button, FluentProvider, Spinner, webLightTheme } from '@fluentui/react-components';
import * as echarts from 'echarts';
import {
  analyse,
  classifyUnmatchedOccurrences,
  dimensionKey,
  fixedCosts,
  forecastBacktest,
  latestCompleteMonth,
  reliabilitySummary,
  transactionsForContext,
} from './analysis.js';
import { buildOverviewStatements, editorializeOverview } from './statements.js';
import type {
  AnalysisContext,
  AyqAnalyticalSnapshot,
  Dimension,
  FixedCostResult,
  Metric,
  Transaction,
} from './types.js';
import type { ArchivedSnapshotPayload, AyqAnalysesBridge } from './preload.js';

declare global {
  interface Window {
    ayqAnalyses: AyqAnalysesBridge;
  }
}
import './styles.css';

type Destination = 'overview' | 'explore' | 'fixed' | 'projection' | 'scenarios' | 'saved';
type ExplorePreset = 'custom' | 'trends' | 'counterparties' | 'expected' | 'forecast-history';

const DESTINATIONS: Array<{ id: Destination; label: string; glyph: string }> = [
  { id: 'overview', label: 'Overview', glyph: '◎' },
  { id: 'explore', label: 'Explore', glyph: '⌗' },
  { id: 'fixed', label: 'Fixed costs', glyph: '≡' },
  { id: 'projection', label: 'Projection', glyph: '↗' },
  { id: 'scenarios', label: 'Scenarios', glyph: '◇' },
  { id: 'saved', label: 'Saved', glyph: '☆' },
];

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const index = year * 12 + monthNumber - 1 + delta;
  const y = Math.floor(index / 12);
  const m = ((index % 12) + 12) % 12 + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function defaultContext(snapshot: AyqAnalyticalSnapshot): AnalysisContext {
  const month = latestCompleteMonth(snapshot);
  return {
    fromMonth: month,
    toMonth: month,
    compare: 'previous',
    metric: 'money-out',
    dimension: 'categoryId',
    accountKeys: [],
    transactionClasses: [],
    includeUncategorised: true,
    minimumAbsoluteAmount: 0,
    search: '',
  };
}

function formatMoney(amount: number, currency = 'EUR'): string {
  return (amount / 100).toLocaleString('nl-NL', { style: 'currency', currency, minimumFractionDigits: 2 });
}

function formatMetric(value: number, metric: Metric, currency: string): string {
  return metric === 'count' ? Math.round(value).toLocaleString('nl-NL') : formatMoney(value, currency);
}

function counterpartyName(snapshot: AyqAnalyticalSnapshot, key: string | null): string {
  if (!key) return '—';
  return snapshot.counterparties.find(x => x.counterpartyKey === key)?.displayName ?? key;
}

function categoryName(snapshot: AyqAnalyticalSnapshot, key: string | null): string {
  if (!key) return 'Uncategorised';
  return snapshot.categories.find(x => x.categoryId === key)?.name ?? key;
}

function accountName(snapshot: AyqAnalyticalSnapshot, key: string): string {
  return snapshot.accounts.find(x => x.accountKey === key)?.name ?? key;
}

function EvidenceTable({ snapshot, transactions }: { snapshot: AyqAnalyticalSnapshot; transactions: Transaction[] }) {
  const occurrenceByTransaction = useMemo(() => {
    const map = new Map<string, string>();
    const records = new Map(snapshot.expectationRecords.map(record => [record.recordKey, record.name] as const));
    for (const occurrence of snapshot.expectedOccurrences) {
      if (occurrence.match) map.set(occurrence.match.transactionKey, records.get(occurrence.recordKey) ?? occurrence.recordKey);
    }
    return map;
  }, [snapshot]);

  if (transactions.length === 0) return <div className="empty-inline">No matching transactions.</div>;
  return (
    <div className="table-wrap evidence-table">
      <table>
        <thead><tr><th>Date</th><th>Counterparty</th><th>Account</th><th>Category</th><th>Class</th><th>Provenance</th><th>Expected match</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {transactions.map(tx => (
            <tr key={tx.transactionKey}>
              <td>{tx.bookingDate}</td>
              <td>{counterpartyName(snapshot, tx.counterpartyKey)}</td>
              <td>{accountName(snapshot, tx.accountKey)}</td>
              <td>{categoryName(snapshot, tx.categoryId)}</td>
              <td>{tx.transactionClass.replaceAll('_', ' ')}</td>
              <td>{tx.categorisation?.source ?? '—'}</td>
              <td>{occurrenceByTransaction.get(tx.transactionKey) ?? '—'}</td>
              <td className="num">{formatMoney(tx.amount.amount, tx.amount.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExploreChart({ rows, metric, currency }: { rows: Array<{ label: string; value: number }>; metric: Metric; currency: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const values = rows.slice(0, 20);
    chart.setOption({
      animation: false,
      grid: { left: 12, right: 18, top: 20, bottom: 72, containLabel: true },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: values.map(x => x.label), axisLabel: { rotate: values.length > 8 ? 36 : 0 } },
      yAxis: { type: 'value' },
      series: [{
        type: 'bar',
        data: values.map(x => metric === 'count' ? x.value : x.value / 100),
        emphasis: { focus: 'series' },
      }],
    });
    const resize = () => chart.resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      chart.dispose();
    };
  }, [rows, metric, currency]);
  return <div className="chart" ref={ref} aria-label="Analysis chart" />;
}

function FixedCostRow({ item, currency }: { item: FixedCostResult; currency: string }) {
  return (
    <tr>
      <td><strong>{item.name}</strong><div className="subtle">{item.recurrenceType} · {item.state}</div></td>
      <td><Badge appearance="outline" color={item.evidenceStatus === 'proven' ? 'success' : 'warning'}>{item.evidenceStatus === 'proven' ? 'Proven' : 'Insufficient'}</Badge></td>
      <td className="num">{formatMoney(item.currentExpected.amount, item.currentExpected.currency)}</td>
      <td>{item.paidHistory.length ? item.paidHistory.map(point => `${formatMoney(point.amount, point.currency)} · ${point.effectiveDate}`).join(' → ') : 'No matched paid history'}</td>
      <td className="num">{item.monthlyCommittedAmount === null ? '—' : formatMoney(item.monthlyCommittedAmount, currency)}</td>
    </tr>
  );
}

function ReliabilityPanel({ snapshot, onClose }: { snapshot: AyqAnalyticalSnapshot; onClose: () => void }) {
  const reliability = reliabilitySummary(snapshot);
  return (
    <aside className="drawer open">
      <header><div><div className="eyebrow">Context</div><h2>Reliability & coverage</h2></div><Button appearance="subtle" onClick={onClose}>Close</Button></header>
      <div className="drawer-body">
        <div className="info-block"><span>Snapshot</span><strong>{snapshot.meta.snapshotId}</strong><small>{reliability.generatedAt}</small></div>
        <div className="info-block"><span>Global reliability boundary</span><strong>{reliability.reliabilityBoundary}</strong><small>Set by {reliability.boundaryBasis.join(', ') || '—'}</small></div>
        <h3>Accounts</h3>
        {reliability.accounts.map(account => (
          <div className="reliability-account" key={account.accountKey}>
            <div><strong>{account.name}</strong><span>statement through {account.lastStatementDate}</span></div>
            <Badge appearance="outline" color={account.reconciliationState === 'agrees' ? 'success' : 'danger'}>{account.reconciliationState}</Badge>
            {account.reconciliationDifference.amount !== 0 && <small>Difference {formatMoney(account.reconciliationDifference.amount, account.reconciliationDifference.currency)}</small>}
          </div>
        ))}
        <div className="policy-note">Reliability qualifies the current result. It is intentionally not a product destination.</div>
      </div>
    </aside>
  );
}

function App() {
  const [archive, setArchive] = useState<ArchivedSnapshotPayload[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('');
  const [destination, setDestination] = useState<Destination>('overview');
  const [preset, setPreset] = useState<ExplorePreset>('custom');
  const [context, setContext] = useState<AnalysisContext | null>(null);
  const [reliabilityOpen, setReliabilityOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const snapshot = useMemo(() => archive.find(x => x.snapshot.meta.snapshotId === selectedSnapshotId)?.snapshot ?? archive.at(-1)?.snapshot ?? null, [archive, selectedSnapshotId]);
  const currency = snapshot?.meta.currencies[0] ?? 'EUR';

  useEffect(() => {
    window.ayqAnalyses.listSnapshots()
      .then(items => {
        setArchive(items);
        const latest = items.at(-1)?.snapshot;
        if (latest) {
          setSelectedSnapshotId(latest.meta.snapshotId);
          setContext(defaultContext(latest));
        }
      })
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    if (!context) setContext(defaultContext(snapshot));
  }, [snapshot, context]);

  const importSnapshots = async () => {
    try {
      setError(null);
      const items = await window.ayqAnalyses.importSnapshots();
      if (items.length) {
        setArchive(items);
        const latest = items.at(-1)!.snapshot;
        setSelectedSnapshotId(latest.meta.snapshotId);
        setContext(defaultContext(latest));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const selectSnapshot = (id: string) => {
    setSelectedSnapshotId(id);
    const next = archive.find(x => x.snapshot.meta.snapshotId === id)?.snapshot;
    if (next) setContext(defaultContext(next));
    setSelectedGroup(null);
  };

  const applyPreset = (next: ExplorePreset) => {
    if (!snapshot || !context) return;
    setPreset(next);
    setDestination('explore');
    setSelectedGroup(null);
    const end = latestCompleteMonth(snapshot);
    if (next === 'trends') setContext({ ...context, fromMonth: shiftMonth(end, -11), toMonth: end, compare: 'year-over-year', metric: 'money-out', dimension: 'month', search: '' });
    if (next === 'counterparties') setContext({ ...context, fromMonth: shiftMonth(end, -11), toMonth: end, compare: 'previous', metric: 'money-out', dimension: 'counterpartyKey', search: '' });
    if (next === 'expected' || next === 'forecast-history') setContext({ ...context, fromMonth: shiftMonth(end, -11), toMonth: end, search: '' });
  };

  const suggestions = useMemo(() => {
    if (!snapshot || !context?.search.trim()) return [] as Array<{ kind: 'counterparty' | 'category'; key: string; label: string }>;
    const query = context.search.trim().toLocaleLowerCase();
    return [
      ...snapshot.counterparties.filter(x => x.displayName.toLocaleLowerCase().includes(query)).slice(0, 5).map(x => ({ kind: 'counterparty' as const, key: x.counterpartyKey, label: x.displayName })),
      ...snapshot.categories.filter(x => x.name.toLocaleLowerCase().includes(query)).slice(0, 5).map(x => ({ kind: 'category' as const, key: x.categoryId, label: x.name })),
    ].slice(0, 8);
  }, [snapshot, context?.search]);

  const chooseSearch = (suggestion: { kind: 'counterparty' | 'category'; label: string }) => {
    if (!context) return;
    setDestination('explore');
    setPreset('custom');
    setContext({ ...context, dimension: suggestion.kind === 'counterparty' ? 'counterpartyKey' : 'categoryId', search: suggestion.label });
    setSearchOpen(false);
  };

  if (loading) return <div className="loading"><Spinner label="Opening AYQ Analyses" /></div>;

  return (
    <div className="app-shell">
      <nav className="rail" aria-label="AYQ Analyses destinations">
        <div className="wordmark">AYQ<span>Analyses</span></div>
        {DESTINATIONS.map(item => (
          <button key={item.id} className={destination === item.id ? 'active' : ''} onClick={() => setDestination(item.id)} title={item.label}>
            <span className="glyph">{item.glyph}</span><span>{item.label}</span>
          </button>
        ))}
      </nav>

      <main className="main">
        <header className="topbar">
          {snapshot && context ? <>
            <div className="control"><label>From</label><input type="month" value={context.fromMonth} onChange={e => setContext({ ...context, fromMonth: e.target.value })} /></div>
            <div className="control"><label>To</label><input type="month" value={context.toMonth} onChange={e => setContext({ ...context, toMonth: e.target.value })} /></div>
            <div className="control"><label>Compare</label><select value={context.compare} onChange={e => setContext({ ...context, compare: e.target.value as AnalysisContext['compare'] })}><option value="previous">previous period</option><option value="year-over-year">same period last year</option><option value="none">no comparison</option></select></div>
            <div className="search-box">
              <label>Search</label>
              <input value={context.search} placeholder="Counterparty, category…" onFocus={() => setSearchOpen(true)} onChange={e => { setContext({ ...context, search: e.target.value }); setSearchOpen(true); }} />
              {searchOpen && suggestions.length > 0 && <div className="search-results">{suggestions.map(s => <button key={`${s.kind}:${s.key}`} onMouseDown={event => event.preventDefault()} onClick={() => chooseSearch(s)}><span>{s.label}</span><small>{s.kind}</small></button>)}</div>}
            </div>
            <button className="coverage-pill" onClick={() => setReliabilityOpen(true)}><span className="dot" />Reliable through {snapshot.meta.coverage.reliabilityBoundary}</button>
            <div className="top-spacer" />
            <select className="snapshot-select" value={snapshot.meta.snapshotId} onChange={e => selectSnapshot(e.target.value)} aria-label="Snapshot">{archive.map(item => <option key={item.snapshot.meta.snapshotId} value={item.snapshot.meta.snapshotId}>{item.snapshot.meta.generatedAt.slice(0, 10)}</option>)}</select>
          </> : <div className="top-spacer" />}
          <Button appearance="primary" onClick={importSnapshots}>Import snapshot</Button>
        </header>

        {error && <div className="error-banner"><strong>Could not complete the action.</strong> {error}</div>}

        <section className="content">
          {!snapshot || !context ? <EmptyStart onImport={importSnapshots} /> : (
            <DestinationView
              destination={destination}
              snapshot={snapshot}
              archive={archive}
              context={context}
              setContext={setContext}
              preset={preset}
              applyPreset={applyPreset}
              selectedGroup={selectedGroup}
              setSelectedGroup={setSelectedGroup}
              currency={currency}
            />
          )}
        </section>
      </main>
      {snapshot && reliabilityOpen && <ReliabilityPanel snapshot={snapshot} onClose={() => setReliabilityOpen(false)} />}
      {reliabilityOpen && <div className="scrim" onClick={() => setReliabilityOpen(false)} />}
    </div>
  );
}

function EmptyStart({ onImport }: { onImport: () => void }) {
  return <div className="empty-start"><div className="empty-mark">AYQ</div><h1>Import an analytical snapshot</h1><p>AYQ Analyses never opens the Actual database or AYQ sidecar. It reads only the explicit read-only snapshot produced by AYQ.</p><Button appearance="primary" onClick={onImport}>Import snapshot</Button></div>;
}

function DestinationView({ destination, snapshot, archive, context, setContext, preset, applyPreset, selectedGroup, setSelectedGroup, currency }: {
  destination: Destination;
  snapshot: AyqAnalyticalSnapshot;
  archive: ArchivedSnapshotPayload[];
  context: AnalysisContext;
  setContext: (value: AnalysisContext) => void;
  preset: ExplorePreset;
  applyPreset: (value: ExplorePreset) => void;
  selectedGroup: string | null;
  setSelectedGroup: (value: string | null) => void;
  currency: string;
}) {
  if (destination === 'overview') return <Overview snapshot={snapshot} reportingMonth={context.toMonth} />;
  if (destination === 'fixed') return <FixedCosts snapshot={snapshot} currency={currency} />;
  if (destination === 'projection') return <FutureSurface title="Projection" text="Statistical Projection is deliberately separate from AYQ's canonical Forecast. Its model is still an OPEN product decision, so the software does not fabricate one." />;
  if (destination === 'scenarios') return <FutureSurface title="Scenarios" text="Scenario state belongs to Analyses, but scenario semantics are not yet settled. This destination is reserved without inventing behaviour." />;
  if (destination === 'saved') return <FutureSurface title="Saved Analyses" text="The application boundary reserves local non-financial Saved Analysis state. Exact save/reopen behaviour is still OPEN." />;
  return <Explore snapshot={snapshot} archive={archive} context={context} setContext={setContext} preset={preset} applyPreset={applyPreset} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} currency={currency} />;
}

function Overview({ snapshot, reportingMonth }: { snapshot: AyqAnalyticalSnapshot; reportingMonth: string }) {
  const statements = useMemo(() => buildOverviewStatements(snapshot, reportingMonth), [snapshot, reportingMonth]);
  const cards = useMemo(() => editorializeOverview(statements), [statements]);
  return <>
    <div className="page-head"><div><div className="eyebrow">Attention, not catalogue</div><h1>Overview</h1><p>{reportingMonth}</p></div></div>
    {cards.length === 0 ? <div className="quiet"><strong>Nothing needs attention.</strong><span>Zero Overview statements is a valid analytical result.</span></div> : <div className="overview-grid">{cards.map(card => <article className="statement-card" key={card.subject}><div className="card-top"><Badge appearance="outline">{card.primary.tier}</Badge><span className="priority">P{card.primary.priority}</span></div><h2>{card.primary.title}</h2><p>{card.primary.detail}</p>{card.secondary.length > 0 && <div className="also"><strong>Also true of this subject</strong>{card.secondary.map(statement => <div key={`${statement.id}:${statement.detail}`}>{statement.detail}</div>)}</div>}<small>Evidence: {card.primary.evidencePath}</small></article>)}</div>}
  </>;
}

function Explore({ snapshot, archive, context, setContext, preset, applyPreset, selectedGroup, setSelectedGroup, currency }: {
  snapshot: AyqAnalyticalSnapshot;
  archive: ArchivedSnapshotPayload[];
  context: AnalysisContext;
  setContext: (value: AnalysisContext) => void;
  preset: ExplorePreset;
  applyPreset: (value: ExplorePreset) => void;
  selectedGroup: string | null;
  setSelectedGroup: (value: string | null) => void;
  currency: string;
}) {
  const result = useMemo(() => analyse(snapshot, context), [snapshot, context]);
  const transactions = useMemo(() => transactionsForContext(snapshot, context), [snapshot, context]);
  const evidence = useMemo(() => selectedGroup === null ? [] : transactions.filter(tx => dimensionKey(tx, context.dimension) === selectedGroup), [transactions, selectedGroup, context.dimension]);
  return <>
    <div className="page-head"><div><div className="eyebrow">One analytical canvas</div><h1>Explore</h1></div><div className="preset-row"><button className={preset === 'trends' ? 'on' : ''} onClick={() => applyPreset('trends')}>Trends</button><button className={preset === 'counterparties' ? 'on' : ''} onClick={() => applyPreset('counterparties')}>Counterparties</button><button className={preset === 'expected' ? 'on' : ''} onClick={() => applyPreset('expected')}>Expected vs actual</button><button className={preset === 'forecast-history' ? 'on' : ''} onClick={() => applyPreset('forecast-history')}>Forecast history</button></div></div>
    {preset === 'expected' ? <ExpectedActual snapshot={snapshot} context={context} /> : preset === 'forecast-history' ? <ForecastHistory snapshots={archive.map(x => x.snapshot)} /> : <>
      <div className="composer-strip">
        <div className="control"><label>Metric</label><select value={context.metric} onChange={e => setContext({ ...context, metric: e.target.value as Metric })}><option value="money-out">money out</option><option value="money-in">money in</option><option value="net">net</option><option value="count">count</option></select></div>
        <div className="control"><label>Group by</label><select value={context.dimension} onChange={e => { setContext({ ...context, dimension: e.target.value as Dimension }); setSelectedGroup(null); }}><option value="categoryId">category</option><option value="counterpartyKey">counterparty</option><option value="accountKey">account</option><option value="transactionClass">transaction class</option><option value="month">month</option></select></div>
        <label className="check"><input type="checkbox" checked={context.includeUncategorised} onChange={e => setContext({ ...context, includeUncategorised: e.target.checked })} /> include uncategorised</label>
        <div className="context-sentence">{context.fromMonth} → {context.toMonth} · {context.metric} · by {context.dimension.replace('Id', '').replace('Key', '')}{context.search ? ` · search “${context.search}”` : ''}</div>
      </div>
      {result.reliabilityLimitation && <div className="warning-banner"><strong>Coverage limitation.</strong> {result.reliabilityLimitation}</div>}
      <div className="metric-row"><div className="metric-card"><span>Result</span><strong>{formatMetric(result.value, context.metric, currency)}</strong><small>{result.transactionCount} transactions</small></div>{result.comparisonValue !== null && <div className="metric-card"><span>Change</span><strong>{formatMetric(result.delta ?? 0, context.metric, currency)}</strong><small>vs {formatMetric(result.comparisonValue, context.metric, currency)}</small></div>}</div>
      {result.rows.length === 0 ? <div className="quiet"><strong>No matching transactions</strong><span>The current filters produce an empty population.</span></div> : <div className="analysis-grid"><div className="panel"><ExploreChart rows={result.rows} metric={context.metric} currency={currency} /></div><div className="panel table-wrap"><table><thead><tr><th>Group</th><th className="num">Value</th><th className="num">Transactions</th></tr></thead><tbody>{result.rows.map(row => <tr className={selectedGroup === row.key ? 'selected' : ''} key={row.key} onClick={() => setSelectedGroup(row.key)}><td>{row.label}</td><td className="num">{formatMetric(row.value, context.metric, currency)}</td><td className="num">{row.transactionCount}</td></tr>)}</tbody></table></div></div>}
      {selectedGroup !== null && <section className="evidence"><div className="section-head"><div><div className="eyebrow">Drill evidence</div><h2>{result.rows.find(x => x.key === selectedGroup)?.label ?? selectedGroup}</h2></div><Button appearance="subtle" onClick={() => setSelectedGroup(null)}>Close evidence</Button></div><EvidenceTable snapshot={snapshot} transactions={evidence} /></section>}
    </>}
  </>;
}

function ExpectedActual({ snapshot, context }: { snapshot: AyqAnalyticalSnapshot; context: AnalysisContext }) {
  const classifications = classifyUnmatchedOccurrences(snapshot);
  const byOccurrence = new Map(classifications.map(x => [x.occurrence.occurrenceKey, x] as const));
  const records = new Map(snapshot.expectationRecords.map(x => [x.recordKey, x] as const));
  const tx = new Map(snapshot.transactions.map(x => [x.transactionKey, x] as const));
  const rows = snapshot.expectedOccurrences.filter(o => o.expectedDate.slice(0, 7) >= context.fromMonth && o.expectedDate.slice(0, 7) <= context.toMonth);
  return <div className="panel table-wrap"><table><thead><tr><th>Expected date</th><th>Record</th><th>Status</th><th>Expected</th><th>Actual</th></tr></thead><tbody>{rows.map(o => { const record = records.get(o.recordKey); const classification = byOccurrence.get(o.occurrenceKey); const actual = o.match ? tx.get(o.match.transactionKey) : null; return <tr key={o.occurrenceKey}><td>{o.expectedDate}</td><td>{record?.name ?? o.recordKey}</td><td>{o.state === 'matched' ? 'matched' : classification?.kind ?? o.state}</td><td>{formatMoney(Math.abs(o.amount.amount), o.amount.currency)}</td><td>{actual ? formatMoney(Math.abs(actual.amount.amount), actual.amount.currency) : '—'}</td></tr>; })}</tbody></table>{rows.length === 0 && <div className="empty-inline">No expectations in the selected period.</div>}</div>;
}

function ForecastHistory({ snapshots }: { snapshots: AyqAnalyticalSnapshot[] }) {
  const rows = forecastBacktest(snapshots);
  return <><div className="policy-note">Canonical AYQ Forecast is displayed as a sealed AYQ result. Analyses does not recompute it. Backtesting compares archived forecasts with later observed balances.</div>{rows.length === 0 ? <div className="quiet"><strong>Not enough archived history</strong><span>Import at least two dated snapshots with comparable forecast points.</span></div> : <div className="panel table-wrap"><table><thead><tr><th>Forecast as of</th><th>Target</th><th className="num">Forecast</th><th className="num">Actual</th><th className="num">Error</th></tr></thead><tbody>{rows.map(row => <tr key={`${row.forecastSnapshotId}:${row.targetDate}`}><td>{row.forecastAsOfDate}</td><td>{row.targetDate}</td><td className="num">{formatMoney(row.forecastAmount, row.currency)}</td><td className="num">{formatMoney(row.actualAmount, row.currency)}</td><td className="num">{formatMoney(row.error, row.currency)}</td></tr>)}</tbody></table></div>}</>;
}

function FixedCosts({ snapshot, currency }: { snapshot: AyqAnalyticalSnapshot; currency: string }) {
  const result = fixedCosts(snapshot);
  return <><div className="page-head"><div><div className="eyebrow">Canonical recurring state only</div><h1>Fixed costs</h1><p>Transaction heuristics do not create recurring truth.</p></div><div className="headline-value"><span>Committed monthly</span><strong>{formatMoney(result.committedMonthly, currency)}</strong></div></div><div className="policy-note">“Expected now” is what AYQ currently expects. “Paid history” is only matched actual history. Suggested records remain Insufficient and are excluded from committed monthly.</div><div className="panel table-wrap"><table><thead><tr><th>Cost</th><th>Evidence</th><th className="num">Expected now</th><th>Paid history</th><th className="num">Monthly committed</th></tr></thead><tbody>{result.items.map(item => <FixedCostRow key={item.recordKey} item={item} currency={currency} />)}</tbody></table></div><div className="policy-note">Recurring-looking transaction streams that have no canonical AYQ expectation record are outside the canonical population. Analyses does not silently infer them.</div></>;
}

function FutureSurface({ title, text }: { title: string; text: string }) {
  return <div className="future"><div className="eyebrow">Reserved product surface</div><h1>{title}</h1><p>{text}</p></div>;
}

createRoot(document.getElementById('root')!).render(<FluentProvider theme={webLightTheme}><App /></FluentProvider>);
