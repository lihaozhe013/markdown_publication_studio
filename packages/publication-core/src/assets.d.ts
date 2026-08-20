declare module 'katex/dist/katex.min.css?raw' {
  const stylesheet: string;
  export default stylesheet;
}

declare module 'katex/dist/fonts/*.woff2?inline' {
  const fontUrl: string;
  export default fontUrl;
}
