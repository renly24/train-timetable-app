declare module 'alexa-verifier' {
  function verifier(
    certUrl: string,
    signature: string,
    body: string,
    cb: (err: Error | null) => void,
  ): void
  export default verifier
}
