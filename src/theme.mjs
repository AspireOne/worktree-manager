export const DEFAULT_THEME = {
  textPrimary: '#eadfce',
  textMuted: '#b7aa98',
  textDim: '#897e70',
  accent: '#c7a56f',
  accentStrong: '#e0bd83',
  context: '#c9a2a6',
  success: '#a8ba8e',
  warning: '#d1b070',
  danger: '#d09286',
};

export function resolveTheme(theme = {}) {
  return {
    ...DEFAULT_THEME,
    ...(theme && typeof theme === 'object' ? theme : {}),
  };
}
