export const colors = {
  primary: '#0F4C81',   // Excess Solar blue
  accent: '#F39C12',    // Solar amber
  success: '#27AE60',   // Eco green
  danger: '#C0392B',
  warning: '#D68910',
  text: '#1A1A1A',
  subtle: '#5D6D7E',
  light: '#F2F4F7',
  lighter: '#FAFBFC',
} as const;

export const spacing = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  '2xl': '3rem',
} as const;

export type Colors = typeof colors;
export type Spacing = typeof spacing;
