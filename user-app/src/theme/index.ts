/**
 * Scraptox design tokens, copied from the design canvas v0.1
 * (https://claude.ai/artifact/NxQKPNq1qhc6N1k2X91Nw5). Screens use these names,
 * never raw hex values.
 *
 * Palette from the frontend logo: brand green #009A33, deep green #00542A,
 * charcoal #242424. `primary` (#00813A) is the button/link green: white text
 * on it passes 4.5:1, which the brighter brand green does not.
 */
export const colors = {
  brand: '#009A33',
  primary: '#00813A',
  deep: '#00542A',
  deep2: '#006A32',

  green50: '#EAF6EE',
  green100: '#D2EDDB',
  green200: '#A6DBB7',
  green400: '#2DB35A',
  green500: '#009A33',
  green600: '#00813A',
  green700: '#006A32',
  green800: '#00542A',
  green900: '#003D1F',

  ink: '#1C211E',
  ink2: '#3A433E',
  muted: '#5B655F',
  faint: '#9AA59F',
  disabledText: '#7D8882',

  bg: '#F3F6F4',
  surface: '#FFFFFF',
  line: '#E1E7E3',
  lineSoft: '#EEF2EF',
  lineStrong: '#D3DCD6',
  disabled: '#E1E7E3',

  /** Money, wallet and rewards only. */
  gold: '#C98A0B',
  goldSoft: '#FFF3DC',
  goldText: '#7A4F00',
  goldLine: '#F1DDB0',

  /** Cancel, destructive actions and errors only. */
  red: '#B42318',
  redSoft: '#FDECEA',
  redText: '#9B1C12',
  redLine: '#F1C8C3',

  blue: '#2F6FD6',
  blueSoft: '#E7EFFC',
  blueText: '#1D4F9C',
  teal: '#12909B',
  tealSoft: '#DFF3F4',
  tealText: '#0B5A62',

  /**
   * Dark accents used sparingly on light screens (hero bands, highlight
   * cards, the tab bar) so the app pairs light and dark instead of being
   * all white. Text on night surfaces uses white / nightText.
   */
  night: '#0F2219',
  night2: '#163126',
  nightLine: 'rgba(255,255,255,0.10)',
  nightText: '#B9CFC2',
  nightMuted: '#86A193',

  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.45)',
};

export type StatusKey = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';

/** Order status colours (backend ORDER_STATUS values). */
export const status: Record<StatusKey, { label: string; bg: string; fg: string; dot: string }> = {
  pending: { label: 'Pending', bg: colors.goldSoft, fg: '#8A5200', dot: colors.gold },
  confirmed: { label: 'Accepted', bg: colors.blueSoft, fg: colors.blueText, dot: colors.blue },
  in_progress: { label: 'On the way', bg: colors.tealSoft, fg: colors.tealText, dot: colors.teal },
  completed: { label: 'Completed', bg: '#E3F4E8', fg: '#00642F', dot: colors.brand },
  cancelled: { label: 'Cancelled', bg: colors.redSoft, fg: colors.redText, dot: colors.red },
};

export type FamilyKey = 'metals' | 'paper' | 'plastic' | 'ewaste' | 'appliances' | 'vehicles' | 'other';

/** One tint per scrap family (tile background / text). */
export const family: Record<FamilyKey, { label: string; bg: string; fg: string }> = {
  metals: { label: 'Metals', bg: '#F7ECE2', fg: '#7A3F12' },
  paper: { label: 'Paper', bg: '#F2EEE4', fg: '#5C4A24' },
  plastic: { label: 'Plastic', bg: colors.blueSoft, fg: colors.blueText },
  ewaste: { label: 'E-waste', bg: '#EEEAFE', fg: '#4A33A8' },
  appliances: { label: 'Appliances', bg: colors.tealSoft, fg: colors.tealText },
  vehicles: { label: 'Vehicles & tyres', bg: '#ECEFF2', fg: '#38444E' },
  other: { label: 'Other', bg: colors.bg, fg: colors.ink2 },
};

export type FontWeight = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';

/** Android picks fonts by file, so each weight is its own file. */
export const font: Record<FontWeight, string> = {
  regular: 'PlusJakartaSans-Regular',
  medium: 'PlusJakartaSans-Medium',
  semibold: 'PlusJakartaSans-SemiBold',
  bold: 'PlusJakartaSans-Bold',
  extrabold: 'PlusJakartaSans-ExtraBold',
};

/** Type scale from the canvas: size / weight. */
export const type = {
  display: { size: 28, w: 'extrabold' as FontWeight },
  title: { size: 22, w: 'extrabold' as FontWeight },
  heading: { size: 17, w: 'bold' as FontWeight },
  body: { size: 15, w: 'medium' as FontWeight },
  label: { size: 13, w: 'semibold' as FontWeight },
  caption: { size: 12, w: 'medium' as FontWeight },
};

export const radius = { sm: 6, md: 10, lg: 12, xl: 16, sheet: 20, pill: 999 };

/**
 * Android elevation only: CSS-style box shadows are drawn in software on
 * Android and make frames late. Shadows go on sheets and map overlays only.
 */
export const shadow = {
  card: { elevation: 1 },
  raised: { elevation: 6, shadowColor: colors.black },
  sheet: { elevation: 16, shadowColor: colors.black },
};

/** Dense spacing (Paytm / PhonePe style): screens use 12dp edges and 8-10dp gaps. */
export const space = { xs: 4, sm: 6, md: 8, lg: 12, xl: 16, xxl: 20 };
