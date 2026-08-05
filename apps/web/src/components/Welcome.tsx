import { useRef, useState } from 'react';
import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';

type Props = {
  onLoadSample: () => void;
  onUploadFile: (file: File) => void;
  onShowHelp: () => void;
};

const FEATURES: { label: string; color: string; title: string; body: string }[] = [
  {
    label: '1',
    color: 'var(--kind-building)',
    title: '階層を可視化',
    body: 'CSVのID/親ID関係から、ツリー表示を自動構築します。',
  },
  {
    label: '2',
    color: 'var(--kind-room)',
    title: '検証する',
    body: '必須項目の抜けや矛盾を画面右にリストアップし、その場で修正できます。',
  },
  {
    label: '3',
    color: 'var(--kind-device)',
    title: '編集する',
    body: 'ノードを選んで、説明付きのフォームでプロパティを編集します。',
  },
  {
    label: '4',
    color: 'var(--kind-point)',
    title: '出力する',
    body: 'CSV / JSON-LD / YAML / RDF / DTDL / WoT など、用途に応じた形式で書き出します。',
  },
];

export function Welcome({ onLoadSample, onUploadFile, onShowHelp }: Props) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    onUploadFile(file);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: { xs: 2, sm: 4 },
        bgcolor: 'background.default',
      }}
    >
      <Paper variant="outlined" sx={{ maxWidth: 720, width: '100%', p: { xs: 3, sm: 5 } }}>
        <Stack spacing={0.5} sx={{ mb: 3 }}>
          <Typography variant="overline" color="primary">
            Building Model Studio
          </Typography>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
            建物のデータモデルを、見て・直して・出力する。
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
            ビル設備（空調・照明・センサー等）のCSVを読み込むと、
            <strong>サイト → 建物 → フロア → 部屋 → 機器 → 計測点</strong>
            の階層に自動整理されます。検証・編集してから、各種データモデル形式で出力できます。
          </Typography>
        </Stack>

        <Stack spacing={3}>
          <Box>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
              はじめる
            </Typography>
            <Box
              onDragEnter={(event) => {
                event.preventDefault();
                if (event.dataTransfer?.types?.includes('Files')) setDrag(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node)) return;
                setDrag(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDrag(false);
                handleFile(event.dataTransfer?.files?.[0]);
              }}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
              }}
              sx={{
                border: '2px dashed',
                borderColor: drag ? 'primary.main' : 'divider',
                borderRadius: 2,
                bgcolor: drag ? 'action.hover' : 'transparent',
                p: 3,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'border-color 0.15s, background-color 0.15s',
              }}
            >
              <Typography variant="h4" sx={{ mb: 1 }}>
                📄
              </Typography>
              <Typography variant="subtitle1">CSVをここへドロップ</Typography>
              <Typography variant="body2" color="text.secondary">
                またはクリックしてファイルを選択（pointlist.md準拠のCSV）
              </Typography>
              <input
                ref={inputRef}
                data-testid="csv-input"
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
            </Box>
            <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
              <Button variant="contained" onClick={onLoadSample}>
                ▶ サンプルデータで試す
              </Button>
              <Button variant="outlined" onClick={onShowHelp}>
                CSV仕様を見る
              </Button>
            </Stack>
          </Box>

          <Box>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
              このツールでできること
            </Typography>
            <Stack spacing={1.25}>
              {FEATURES.map((feature) => (
                <Stack key={feature.label} direction="row" spacing={1.5} alignItems="flex-start">
                  <Chip
                    label={feature.label}
                    size="small"
                    sx={{ bgcolor: feature.color, color: '#fff', fontWeight: 700, mt: 0.25 }}
                  />
                  <Typography variant="body2">
                    <strong>{feature.title}</strong>：{feature.body}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        </Stack>

        <Stack spacing={0.5} sx={{ mt: 4, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">
            初めての方は<strong>「サンプルデータで試す」</strong>から開始するのがおすすめ。
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ファイルはすべて<strong>ブラウザ内で処理</strong>され、サーバには送信されません。
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
