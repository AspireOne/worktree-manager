export const DEFAULT_THEME = {
  textPrimary: '#f0e4d2',
  textLabel: '#c8bba9',
  textMuted: '#a89c8d',
  textDim: '#746b61',
  accent: '#d7b36e',
  accentStrong: '#f0c98f',
  context: '#9fb7b2',
  success: '#acc795',
  warning: '#dda35f',
  danger: '#dc8f82',
};

export function resolveTheme(theme = {}) {
  return {
    ...DEFAULT_THEME,
    ...(theme && typeof theme === 'object' ? theme : {}),
  };
}
