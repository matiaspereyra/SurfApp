export const UI_COLORS = {
  appBg: '#040A10',
  panel: 'rgba(9, 22, 33, 0.9)',
  panelStrong: '#0E1C28',
  panelBorder: '#2A4A61',
  panelBorderSoft: '#234055',
  textPrimary: '#F3FAFF',
  textSecondary: '#A5BFD1',
  textMuted: '#86A3B8',
  accent: '#00D15D',
  accentText: '#07110B',
  danger: '#A92727',
  dangerSoft: '#2E1519',
};

export const UI_RADIUS = {
  sm: 10,
  md: 14,
  lg: 18,
  pill: 999,
};

export const UI_SPACE = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
};

export const UI_TYPE = {
  titleLg: 26,
  titleMd: 20,
  bodyMd: 14,
  bodySm: 12,
  caption: 11,
};

export const UI_BREAKPOINTS = {
  compact: 375,
};

export const isCompactLayout = (screenWidth) => Number(screenWidth || 0) <= UI_BREAKPOINTS.compact;
