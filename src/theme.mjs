export const DEFAULT_THEME = {
  textPrimary: '#f4f7fb',
  textLabel: '#cbd7e3',
  textMuted: '#9aa8b7',
  textDim: '#657386',
  accent: '#91a7ff',
  accentStrong: '#c1ccff',
  context: '#aebbd0',
  success: '#7fd38b',
  warning: '#f0b85a',
  danger: '#f07f7f',
};

export function resolveTheme(theme = {}) {
  return {
    ...DEFAULT_THEME,
    ...(theme && typeof theme === 'object' ? theme : {}),
  };
}
