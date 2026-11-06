declare module 'pdf-lib/dist/pdf-lib.min.js' {
  export * from 'pdf-lib';
}

declare module 'pako' {
  export function inflateRaw(data: Uint8Array, options: { to: 'string' }): string;
}
