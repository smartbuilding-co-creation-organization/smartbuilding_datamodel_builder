declare module '*.yaml?raw' {
  const content: string;
  export default content;
}

declare module '*.ttl?raw' {
  const content: string;
  export default content;
}

declare module '*?raw' {
  const content: string;
  export default content;
}
