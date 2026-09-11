import assert from "node:assert/strict";
import { SaveQueue, SaveTracker, SaveAttempt } from "../src/save-queue";

/*
 * Der 0.23.0-Editor speicherte unverkettet: saveNow() serialisierte sofort und
 * wartete vault.modify ab. Zwei überlappende Writes konnten in beliebiger
 * Reihenfolge landen — ein älterer, langsamerer Write konnte das neuere
 * Dokument auf der Platte überschreiben, während dirty bereits zurückgesetzt
 * wurde. Zusätzlich gab es keinen automatischen Wiederholungsversuch.
 *
 * Diese Suite pinnt den Ersatz-Vertrag:
 *  - strikte Serialisierung (nie zwei gleichzeitige Writes),
 *  - Snapshot zur Ausführungszeit (der letzte Write trägt den neuesten Stand),
 *  - Supersede-Verhalten hält dirty, bis der neueste Stand geschrieben ist,
 *  - Fehler ⇒ sichtbarer Versuch-Status und Wiederholung statt stiller Verlust.
 */

type State = { revision: number };
type Deferred = { promise: Promise<void>; resolve: () => void };

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => { resolve = res; });
  return { promise, resolve };
}

/* Der alte Schreib-Pfad, nachgebaut: unverkettete Writes mit beliebiger
 * Fertigstellungs-Reihenfolge. Belegt, dass ohne Serialisierung der langsame
 * erste Write den schnelleren zweiten überschreiben kann — die data-loss-
 * Hazard, die dieses Modul ersetzt. */
async function oldUnserializedPattern(): Promise<number[]> {
  const file: { content: number[] } = { content: [] };
  const slow = deferred();
  const writes: { payload: number; gate: Promise<void> }[] = [
    { payload: 1, gate: slow.promise },
    { payload: 2, gate: Promise.resolve() },
  ];
  const all = Promise.all(writes.map(async (entry) => {
    await entry.gate;
    file.content.push(entry.payload);
  }));
  await Promise.resolve(); // Write 2 landet sofort, Write 1 wartet noch
  assert.deepEqual(file.content, [2], "Nachbau: der schnelle neue Write ist zuerst fertig");
  slow.resolve();
  await all;
  return file.content;
}

async function main(): Promise<void> {
  /* ---------- SaveQueue: Reihenfolge, Koaleszenz, Fehler-Isolation ---------- */

  {
    // Strikt seriell: ein verlangsamter erster Durchlauf hält den zweiten auf;
    // niemals überlappen zwei Writes.
    const queue = new SaveQueue();
    let inflight = 0;
    let maxInflight = 0;
    const gate = deferred();
    const ran: string[] = [];
    queue.enqueue(async () => { inflight += 1; maxInflight = Math.max(maxInflight, inflight); ran.push("a-start"); await gate.promise; ran.push("a-end"); inflight -= 1; });
    await Promise.resolve(); // Pass A startet
    assert.equal(ran[0], "a-start");
    // Reale Sequenz: der Debounce feuert, während A noch schreibt.
    queue.enqueue(async () => { inflight += 1; maxInflight = Math.max(maxInflight, inflight); ran.push("b-start"); inflight -= 1; });
    await Promise.resolve();
    assert.equal(ran.includes("b-start"), false, "zweiter Pass darf nicht starten, solange der erste läuft");
    gate.resolve();
    await queue.idle();
    assert.deepEqual(ran, ["a-start", "a-end", "b-start"]);
    assert.equal(maxInflight, 1, "höchstens ein Write gleichzeitig");
  }

  {
    // Koaleszenz: mehrere enqueue-Aufrufe, bevor der Pass startet ⇒ genau ein Pass.
    const queue = new SaveQueue();
    let passes = 0;
    queue.enqueue(async () => { await Promise.resolve(); passes += 1; });
    queue.enqueue(async () => { await Promise.resolve(); passes += 1; });
    queue.enqueue(async () => { await Promise.resolve(); passes += 1; });
    await queue.idle();
    assert.equal(passes, 1, "wartende enqueues werden koalesziert");
  }

  {
    // Fehler-Isolation: ein werfender Pass beschädigt die Kette nicht.
    const queue = new SaveQueue();
    let after = 0;
    queue.enqueue(async () => { throw new Error("kaputt"); });
    await queue.idle();
    queue.enqueue(async () => { after += 1; });
    await queue.idle();
    assert.equal(after, 1, "Kette überlebt einen werfenden Pass");
  }

  /* ---------- SaveTracker: Snapshot, Supersede, Fehler-Wiederholung ---------- */

  {
    // Der letzte erfolgreich geschriebene Stand ist der neueste, auch wenn der
    // erste Write langsamer fertig wird (Kern des 0.23.0-Hazards — contra:
    // siehe oldUnserializedPattern).
    const stale = await oldUnserializedPattern();
    assert.deepEqual(stale, [2, 1], "alter Pfad: Landereihenfolge [neu, alt] — der alte Stand überschreibt den neuen");
    assert.equal(stale[stale.length - 1], 1, "Nachbau des alten Pfads überschreibt Neueres mit Altem — genau das Verhalten, das die Queue verhindern muss");

    const tracker = new SaveTracker();
    const written: State[] = [];
    const gate = deferred();
    const attempts: SaveAttempt[] = [];

    tracker.markChanged(); // Revision 1
    const firstWrite = async () => {
      const snapshot: State = { revision: tracker.revision };
      await gate.promise;
      written.push(snapshot);
    };
    const first = tracker.tryDrain(firstWrite); // erfasst Revision 1, wartet auf das Gate
    tracker.markChanged(); // Revision 2 — der Nutzer schreibt weiter, während der Write läuft
    gate.resolve();
    attempts.push(await first);

    const second = tracker.tryDrain(async () => { written.push({ revision: tracker.revision }); });
    attempts.push(await second);

    assert.equal(attempts[0].status, "superseded");
    assert.equal(attempts[1].status, "clean");
    assert.equal(tracker.dirty, false);
    assert.deepEqual(written.map((state) => state.revision), [1, 2], "Snapshot zur Ausführungszeit; letzter Write trägt Revision 2");
    assert.equal(written[written.length - 1].revision, 2, "der neue Stand landet zuletzt auf der Platte");

    // Ohne neue Änderung passiert nichts mehr.
    const third = await tracker.tryDrain(async () => { throw new Error("darf nie laufen"); });
    assert.equal(third.status, "none");
  }

  {
    // Fehler ⇒ failed-Status, dirty bleibt gesetzt; der Folgende-Versuch räumt auf.
    const tracker = new SaveTracker();
    tracker.markChanged();
    let failing = true;
    const first = await tracker.tryDrain(async () => { if (failing) throw new Error("Schreiben fehlgeschlagen"); });
    assert.equal(first.status, "failed");
    assert.equal(tracker.dirty, true, "nach Fehler bleibt dirty für den Wiederholungsversuch gesetzt");
    failing = false;
    const retry = await tracker.tryDrain(async () => {});
    assert.equal(retry.status, "clean");
    assert.equal(tracker.dirty, false);
  }

  {
    // flagDirty markiert schmutzig, ohne die Revision zu erhöhen (Migration,
    // Gestenabschluss) — Stale-Checks gegen die Revision bleiben stabil.
    const tracker = new SaveTracker();
    tracker.flagDirty();
    const revisionBefore = tracker.revision;
    const attempt = await tracker.tryDrain(async () => {});
    assert.equal(attempt.status, "clean");
    assert.equal(tracker.revision, revisionBefore, "flagDirty erhöht die Revision nicht");

    tracker.markChanged();
    assert.equal(tracker.revision, revisionBefore + 1, "markChanged erhöht genau um eins");
  }

  console.log("Save-Queue und Save-Tracker Vertragstests bestanden");
}

main().catch((error) => { console.error(error); process.exit(1); });