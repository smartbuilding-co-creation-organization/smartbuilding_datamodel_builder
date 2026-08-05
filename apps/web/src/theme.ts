import { createTheme } from '@mui/material/styles';
import type {} from '@mui/x-data-grid/themeAugmentation';

export type UiScaleKey = 'compact' | 'regular' | 'large';

export const uiScales = {
  compact: {
    label: '小',
    fontSize: 13,
    lineHeight: 1.35,
    gridRowHeight: 36,
    gridHeaderHeight: 36,
  },
  regular: {
    label: '中',
    fontSize: 14,
    lineHeight: 1.45,
    gridRowHeight: 42,
    gridHeaderHeight: 40,
  },
  large: {
    label: '大',
    fontSize: 15,
    lineHeight: 1.55,
    gridRowHeight: 48,
    gridHeaderHeight: 44,
  },
} as const;

export function buildTheme(scaleKey: UiScaleKey = 'compact') {
  const scale = uiScales[scaleKey];

  return createTheme({
    typography: {
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize: scale.fontSize,
    },
    shape: {
      borderRadius: 8,
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            lineHeight: scale.lineHeight,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 8,
            minHeight: 32,
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          size: 'small',
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            padding: '8px 16px',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          sizeSmall: {
            height: 20,
            fontSize: '0.75rem',
          },
        },
      },
      MuiDataGrid: {
        styleOverrides: {
          root: {
            borderRadius: 8,
          },
          columnHeaders: {
            backgroundColor: '#f6f7f9',
          },
        },
      },
    },
  });
}
