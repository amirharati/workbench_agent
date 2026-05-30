import React from 'react';
import {
  buildHubQueueMetricRows,
  explainHubQueueOutcome,
  type HubQueueOutcome,
} from '../../lib/pipeline/queueOutcomeSnapshot';

export interface QueueOutcomePanelProps {
  outcome: HubQueueOutcome;
}

function changeColor(change: number, primary: boolean): string {
  if (change === 0) return 'var(--text-faint)';
  if (!primary) return 'var(--text-muted)';
  return change < 0 ? 'var(--er-ok, #3fb950)' : 'var(--er-warn, #d29922)';
}

export const QueueOutcomePanel: React.FC<QueueOutcomePanelProps> = ({ outcome }) => {
  const rows = buildHubQueueMetricRows(outcome);
  const { headline, lines, poolHighlights } = explainHubQueueOutcome(outcome);

  return (
    <div
      style={{
        marginBottom: 14,
        borderRadius: 8,
        border: '1px solid var(--border)',
        overflow: 'hidden',
        background: 'var(--bg-glass)',
      }}
    >
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        <div
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 700,
            color: 'var(--text)',
            marginBottom: 8,
          }}
        >
          {headline}
        </div>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            lineHeight: 1.55,
          }}
        >
          {lines.map((line) => (
            <li key={line} style={{ marginBottom: 4 }}>
              {line}
            </li>
          ))}
        </ul>
        {poolHighlights.length > 0 ? (
          <div
            style={{
              marginTop: 10,
              padding: '8px 10px',
              borderRadius: 6,
              fontSize: 'var(--text-xs)',
              lineHeight: 1.5,
              color: 'var(--text)',
              background: 'color-mix(in srgb, var(--er-warn, #d29922) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--er-warn, #d29922) 28%, transparent)',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Pool changes</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {poolHighlights.map((line) => (
                <li key={line} style={{ marginBottom: 2 }}>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div style={{ padding: '10px 14px 12px' }}>
        <div
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: 'var(--text-faint)',
            marginBottom: 8,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          Library queues — before → after
        </div>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 'var(--text-xs)',
          }}
        >
          <thead>
            <tr style={{ color: 'var(--text-faint)', textAlign: 'left' }}>
              <th style={{ padding: '4px 8px 6px 0', fontWeight: 600 }}>Bucket</th>
              <th style={{ padding: '4px 8px', fontWeight: 600, textAlign: 'right' }}>Before</th>
              <th style={{ padding: '4px 8px', fontWeight: 600, textAlign: 'center' }}>→</th>
              <th style={{ padding: '4px 0 6px 8px', fontWeight: 600, textAlign: 'right' }}>After</th>
              <th style={{ padding: '4px 0 6px 12px', fontWeight: 600, textAlign: 'right' }}>Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                style={{
                  borderTop: '1px solid var(--border)',
                  background: row.primary
                    ? 'color-mix(in srgb, var(--accent) 8%, transparent)'
                    : 'transparent',
                }}
              >
                <td style={{ padding: '8px 8px 8px 0', verticalAlign: 'top' }}>
                  <div
                    style={{
                      fontWeight: row.primary ? 700 : 600,
                      color: row.primary ? 'var(--text)' : 'var(--text-muted)',
                    }}
                  >
                    {row.label}
                    {row.primary ? (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: '0.85em',
                          color: 'var(--accent)',
                          fontWeight: 600,
                        }}
                      >
                        focus
                      </span>
                    ) : null}
                  </div>
                  <div style={{ color: 'var(--text-faint)', marginTop: 2, lineHeight: 1.35 }}>
                    {row.hint}
                  </div>
                </td>
                <td
                  style={{
                    padding: '8px',
                    textAlign: 'right',
                    color: 'var(--text-muted)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {row.before}
                </td>
                <td style={{ padding: '8px', textAlign: 'center', color: 'var(--text-faint)' }}>→</td>
                <td
                  style={{
                    padding: '8px',
                    textAlign: 'right',
                    fontWeight: 600,
                    color: 'var(--text)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {row.after}
                </td>
                <td
                  style={{
                    padding: '8px 0 8px 12px',
                    textAlign: 'right',
                    fontWeight: 700,
                    color: changeColor(row.change, !!row.primary),
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {row.change === 0 ? '—' : row.change > 0 ? `+${row.change}` : row.change}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
