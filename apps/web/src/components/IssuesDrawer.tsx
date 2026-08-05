import { Box, Button, Chip, Divider, Drawer, Stack, Typography } from '@mui/material';
import type { Issue } from '@repo/core';

type Props = {
  open: boolean;
  issues: Issue[];
  onClose: () => void;
  onJump: (rowId: string) => void;
};

export function IssuesDrawer({ open, issues, onClose, onJump }: Props) {
  return (
    <Drawer anchor="right" open={open} onClose={onClose} data-testid="issues-drawer">
      <Box sx={{ width: { xs: 320, sm: 440 }, p: 2 }} role="dialog" aria-label="検証Issue一覧">
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h6">検証Issue</Typography>
          <Chip size="small" label={issues.length} />
          <Button onClick={onClose} sx={{ ml: 'auto' }}>
            閉じる
          </Button>
        </Stack>
        <Divider sx={{ my: 2 }} />
        {issues.length === 0 ? (
          <Typography color="success.main">Issue はありません。</Typography>
        ) : (
          <Stack spacing={1.5}>
            {issues.map((issue, index) => (
              <Box
                key={`${issue.code}-${issue.focusNode ?? issue.rowId ?? index}-${issue.field ?? ''}`}
                sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}
              >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Chip
                    size="small"
                    color={
                      issue.severity === 'info'
                        ? 'info'
                        : issue.severity === 'warning'
                          ? 'warning'
                          : 'error'
                    }
                    label={issue.severity ?? 'error'}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {issue.code}
                  </Typography>
                </Stack>
                <Typography variant="body2">{issue.message}</Typography>
                {issue.rowId || issue.field ? (
                  <Typography variant="caption" color="text.secondary" display="block">
                    {[issue.rowId, issue.field].filter(Boolean).join(' / ')}
                  </Typography>
                ) : null}
                {issue.sourceConstraintComponent ? (
                  <Typography variant="caption" color="text.secondary" display="block">
                    {issue.sourceConstraintComponent}
                  </Typography>
                ) : null}
                {issue.rowId ? (
                  <Button size="small" onClick={() => onJump(issue.rowId!)} sx={{ mt: 0.5 }}>
                    対象を表示
                  </Button>
                ) : null}
              </Box>
            ))}
          </Stack>
        )}
      </Box>
    </Drawer>
  );
}
