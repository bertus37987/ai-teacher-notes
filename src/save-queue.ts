/*
 * Save-Queue und Save-Tracker — Basis des zuverlässigen Speicherns (M1/P0).
 *
 * Vorher speicherte InlineHandwritingEditor unverkettet: jeder saveNow()-Aufruf
 * serialisierte sofort und schrieb direkt. Zwei überlappende Writes konnten in
 * beliebiger Reihenfolge fertig werden — ein alter, langsamer Write konnte den
 * neuen Stand auf der Platte überschreiben, nachdem dirty bereits zurückgesetzt
 * war. Diese zwei Klassen ersetzen dieses Muster:
 *
 *  - SaveQueue serialisiert: höchstens ein Pass läuft, alle wartenden
 *    enqueues werden koalesziert, werfende Pässe töten die Kette nicht.
 *  - SaveTracker hält dirty/Revision und trifft die Supersede-Entscheidung:
 *    Der Snapshot entsteht in der Drain-Ausführung (nicht beim enqueue), und
 *    dirty wird nur gelöscht, wenn während des Writes keine neue Änderung kam.
 */

export type SaveAttempt = { status: "clean" } | { status: "superseded" } | { status: "failed"; error: unknown } | { status: "none" };

/** Write-Stati; „failed“ bedeutet: dirty bleibt gesetzt, Wiederholung erwartet. */
export class SaveTracker {
  private dirtyState = false;
  private revisionCounter = 0;

  get dirty(): boolean { return this.dirtyState; }
  get revision(): number { return this.revisionCounter; }

  /** Inhalt geändert: dirty setzen und Revision erhöhen (stale checks laufen gegen die Revision). */
  markChanged(): void { this.dirtyState = true; this.revisionCounter += 1; }

  /** Nur dirty setzen, ohne Revision (Migration beim Laden, Gestenabschluss). */
  flagDirty(): void { this.dirtyState = true; }

  /**
   * Ein Schreibversuch. serialisiere/schreibe ausschließlich in `write`, damit
   * der Snapshot den Zustand zur Ausführungszeit trägt (nicht den beim enqueue).
   */
  async tryDrain(write: () => Promise<void>): Promise<SaveAttempt> {
    if (!this.dirtyState) return { status: "none" };
    const revision = this.revisionCounter;
    try {
      await write();
    } catch (error) {
      return { status: "failed", error };
    }
    if (revision === this.revisionCounter) {
      this.dirtyState = false;
      return { status: "clean" };
    }
    return { status: "superseded" };
  }
}

/** Strikt serielle Ein-Schreiber-Warteschlange mit Koaleszenz der wartenden Pässe. */
export class SaveQueue {
  private chain: Promise<void> = Promise.resolve();
  private queued = false;

  /** Einen Drain-Pass anhängen. Solange ein Pass nur geplant ist, sind weitere Aufrufe No-Ops. */
  enqueue(drain: () => Promise<void>): void {
    if (this.queued) return;
    this.queued = true;
    this.chain = this.chain.then(async () => {
      this.queued = false;
      try {
        await drain();
      } catch {
        // Drain behandelt seine Fehler selbst; die Kette bleibt intakt.
      }
    });
  }

  /** Wartet alle bis jetzt angehängten Pässe ab (Unload-/Testhilfe). */
  idle(): Promise<void> { return this.chain; }
}