// Colour arithmetic, so that claims about colour can be tested.
//
// Two things in this product are stated as rules rather than as taste: that a
// foreground on a filled accent surface reaches 4.5:1 (04 A16, A18), and that
// the accent and the state scale never share a tone (A17). Both are checkable,
// and a rule that is only written in a comment is not a rule.
//
// Nothing here draws anything. It reads the hexadecimal values the token module
// holds and turns them into numbers the tests can assert on.

/** A colour as its three channels, 0-255. */
export type AyqRgb = { r: number; g: number; b: number };

/** `#rrggbb` or `#rgb` as channels. Anything else is a fault in the tokens. */
export function ayqRgb(hex: string): AyqRgb {
  const value = hex.trim().replace(/^#/, '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map(one => one + one)
          .join('')
      : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`${hex} is not a colour this product can reason about`);
  }
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

/** One channel, linearised as WCAG 2 defines it. */
function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928
    ? scaled / 12.92
    : ((scaled + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance, WCAG 2. */
export function ayqLuminance(hex: string): number {
  const { r, g, b } = ayqRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * The contrast ratio between two colours, 1 to 21.
 *
 * Order does not matter: the lighter of the two is always the numerator.
 */
export function ayqContrast(one: string, other: string): number {
  const a = ayqLuminance(one);
  const b = ayqLuminance(other);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** sRGB to CIE XYZ, D65. */
function xyz(hex: string): [number, number, number] {
  const { r, g, b } = ayqRgb(hex);
  const [lr, lg, lb] = [channel(r), channel(g), channel(b)];
  return [
    lr * 0.4124 + lg * 0.3576 + lb * 0.1805,
    lr * 0.2126 + lg * 0.7152 + lb * 0.0722,
    lr * 0.0193 + lg * 0.1192 + lb * 0.9505,
  ];
}

/** CIE L*a*b*, D65 white. */
export function ayqLab(hex: string): [number, number, number] {
  const [x, y, z] = xyz(hex);
  const white: [number, number, number] = [0.95047, 1, 1.08883];
  const f = (value: number): number =>
    value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const [fx, fy, fz] = [f(x / white[0]), f(y / white[1]), f(z / white[2])];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * How far apart two colours are to an eye, CIE76.
 *
 * Used to hold A17 to something stronger than "these two strings differ": a
 * state colour that had drifted to within a few units of the accent would be
 * the accent carrying a state meaning, whatever it was called.
 */
export function ayqDifference(one: string, other: string): number {
  const a = ayqLab(one);
  const b = ayqLab(other);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
