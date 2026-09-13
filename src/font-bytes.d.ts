/**
 * Schriften und Modelle, die esbuild mit dem Loader `binary` einbettet.
 * Die Handschrift-Schrift muss im Bundle liegen: Installationen über BRAT oder den
 * Community-Store bekommen nur `main.js`, `manifest.json` und `styles.css` — ein Pfad
 * nach `assets/` läuft dort ins Leere (Nutzerbefund 13.9.2026).
 */
declare module "*.woff2" {
  // `Uint8Array<ArrayBuffer>` (nicht das Standard-`Uint8Array<ArrayBufferLike>`): nur so passt der
  // Puffer direkt in `new FontFace(name, source: BufferSource)`.
  const bytes: Uint8Array<ArrayBuffer>;
  export default bytes;
}
