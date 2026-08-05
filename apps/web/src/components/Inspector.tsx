import type { RowRecord } from '@repo/core';
import { PROPERTY_HINTS, REQUIRED_BY_KIND } from '../data/propertyHints';
import { toDisplayKind } from './TreePanel';

type Props = {
  row: RowRecord | undefined;
  onChange: (key: string, value: string) => void;
  fieldErrors: Record<string, string>;
  descendantCount: number;
  expertMode: boolean;
};

export function Inspector({ row, onChange, fieldErrors, descendantCount, expertMode }: Props) {
  if (!row) {
    return (
      <div className="empty-state">
        <div>
          <div className="ic">👈</div>
          <div className="title">ノードを選択してください</div>
          <div>左の階層ツリーから項目を選ぶと、ここに詳細が表示されます。</div>
        </div>
      </div>
    );
  }

  const kind = (row.kind as string | undefined) ?? '';
  const displayKind = toDisplayKind(kind);
  const required = REQUIRED_BY_KIND[kind.toLowerCase()] ?? [];

  const priorityKeys = [
    'id',
    'kind',
    'name',
    'parentId',
    ...required.filter((k) => !['id', 'kind', 'name', 'parentId'].includes(k)),
  ];
  const extraKeys = Object.keys(row).filter((k) => !priorityKeys.includes(k) && k !== 'children');
  const seen = new Set<string>();
  const orderedKeys = [...priorityKeys, ...extraKeys].filter((k) => {
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return (
    <div className="inspector" data-testid="inspector-panel">
      <div className="insp-hero">
        <span className={`kind-pill insp-kind kind-${displayKind}`}>{displayKind}</span>
        <h2>{(row.name as string) || (row.id as string)}</h2>
        <span className="insp-id">{row.id as string}</span>
        <div className="insp-meta">
          {descendantCount > 0 ? `子要素 ${descendantCount} 件` : '末端ノード'}
        </div>
      </div>

      {!expertMode && kind.toLowerCase() === 'site' && (
        <div className="insp-section">
          <div className="coach">
            <span className="coach-icon">i</span>
            <span>
              <b>サイト</b>は最上位の階層です。1つの敷地・拠点に複数の建物が紐づきます。
            </span>
          </div>
        </div>
      )}

      <div className="insp-section">
        <h4>
          プロパティ <span className="count">{orderedKeys.length}</span>
        </h4>
        {orderedKeys.map((key) => {
          const hint = PROPERTY_HINTS[key];
          const isRequired = required.includes(key);
          const err = fieldErrors[key];
          const value = (row[key] as string | undefined) ?? '';

          return (
            <div className="prop-row" key={key} data-testid={`inspector-prop-${key}`}>
              <div className="prop-label">
                <span>{hint?.label ?? key}</span>
                {hint?.label && (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'var(--text-faint)',
                    }}
                  >
                    {key}
                  </span>
                )}
                {isRequired && <span className="req">必須</span>}
                {hint?.desc && (
                  <span className="tooltip-wrap">
                    <span className="info-btn" title={hint.desc}>
                      ?
                    </span>
                    <span className="tip">{hint.desc}</span>
                  </span>
                )}
              </div>
              <input
                className={'prop-value' + (err ? ' error' : '')}
                value={value}
                onChange={(e) => onChange(key, e.target.value)}
                aria-label={hint?.label ?? key}
                aria-invalid={!!err}
              />
              {!expertMode && hint?.desc && <div className="prop-desc">{hint.desc}</div>}
              {err && <div className="prop-error">⚠ {err}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
