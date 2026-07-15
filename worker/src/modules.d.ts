// Binary imports resolved by the wrangler rules in wrangler.toml.
declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}
declare module '*.woff' {
  const data: ArrayBuffer;
  export default data;
}
