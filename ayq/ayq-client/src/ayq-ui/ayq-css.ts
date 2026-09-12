// Borders, written out.
//
// Griffel does not take `border`, `borderColor` or `borderWidth`: a shorthand
// is one declaration that sets four properties, and atomic CSS cannot undo
// three of them later. These build the longhands, so that a border stays one
// expression in the source and four declarations in the stylesheet.

type AyqEdgeBorder = {
  borderTopWidth?: string;
  borderRightWidth?: string;
  borderBottomWidth?: string;
  borderLeftWidth?: string;
  borderTopStyle?: 'solid' | 'dashed' | 'none';
  borderRightStyle?: 'solid' | 'dashed' | 'none';
  borderBottomStyle?: 'solid' | 'dashed' | 'none';
  borderLeftStyle?: 'solid' | 'dashed' | 'none';
  borderTopColor?: string;
  borderRightColor?: string;
  borderBottomColor?: string;
  borderLeftColor?: string;
};

export function ayqBorder(
  colour: string,
  width = 'var(--ayq-hairline)',
  style: 'solid' | 'dashed' = 'solid',
): AyqEdgeBorder {
  return {
    borderTopWidth: width,
    borderRightWidth: width,
    borderBottomWidth: width,
    borderLeftWidth: width,
    borderTopStyle: style,
    borderRightStyle: style,
    borderBottomStyle: style,
    borderLeftStyle: style,
    borderTopColor: colour,
    borderRightColor: colour,
    borderBottomColor: colour,
    borderLeftColor: colour,
  };
}

export function ayqBorderBottom(
  colour: string,
  width = 'var(--ayq-hairline)',
  style: 'solid' | 'dashed' = 'solid',
): AyqEdgeBorder {
  return {
    borderBottomWidth: width,
    borderBottomStyle: style,
    borderBottomColor: colour,
  };
}

export function ayqBorderTop(
  colour: string,
  width = 'var(--ayq-hairline)',
  style: 'solid' | 'dashed' = 'solid',
): AyqEdgeBorder {
  return {
    borderTopWidth: width,
    borderTopStyle: style,
    borderTopColor: colour,
  };
}

/** No border at all, written the same way. */
export const AYQ_NO_BORDER: AyqEdgeBorder = ayqBorder('transparent', '0', 'solid');
