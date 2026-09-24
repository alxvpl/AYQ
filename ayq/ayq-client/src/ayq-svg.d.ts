// An SVG imported as text: esbuild's `text` loader hands the file over as a
// string, and the mark component draws it inline. The only such import is the
// mark's vector master in `src/ayq-brand`.
declare module '*.svg' {
  const text: string;
  export default text;
}
