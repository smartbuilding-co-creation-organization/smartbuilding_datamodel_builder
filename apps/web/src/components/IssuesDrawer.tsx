import type { Issue } from '@repo/core';

type Props = {
  open: boolean;
  issues: Issue[];
  onClose: () => void;
  onJump: (rowId: string) => void;
};

export function IssuesDrawer({ open, issues, onClose, onJump }: Props) {
  return (
    <div className={'issues-drawer' + (open ? ' open' : '')} data-testid="issues-drawer" aria-label="検証エラー一覧">
      <div className="drawer-head">
        <h3>検証エラー — {issues.length} 件</h3>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="閉じる">
          ✕
        </button>
      </div>
      <div className="drawer-body">
        {issues.length === 0 ? (
          <div className="empty-state">
            <div>
              <div className="ic">✓</div>
              <div className="title">エラーなし</div>
              <div>すべての必須項目が満たされています。</div>
            </div>
          </div>
        ) : (
          issues.map((iss, i) => (
            <div
              className="issue-item"
              key={i}
              onClick={() => iss.rowId && onJump(iss.rowId)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && iss.rowId) onJump(iss.rowId); }}
            >
              <div className="issue-row">{iss.rowId}</div>
              <div className="issue-msg">{iss.message}</div>
              {iss.field && <div className="issue-field">{iss.field}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
