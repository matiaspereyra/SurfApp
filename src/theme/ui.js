export const UI_COLORS = {
  appBg: '#F3F6FA',
  panel: '#FFFFFF',
  panelStrong: '#F8FAFC',
  panelBorder: '#D7DFE7',
  panelBorderSoft: '#E5EBF1',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',
  accent: '#111827',
  accentText: '#FFFFFF',
  danger: '#B4232F',
  dangerSoft: '#FEECEF',
};

export const UI_RADIUS = {
  sm: 6,
  md: 8,
  lg: 10,
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
