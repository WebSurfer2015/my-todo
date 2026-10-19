// Round-8 coverage pass (2026-10-19): guards that mutation testing showed
// unpinned — the horizon is cleared on a rule change / resume, a still-past
// end is no resume, a rule-change Undo keeps the user's own rows, and Mochi's
// reminder comparison is order-insensitive but sees a nag-interval change.
import { describe, expect, it } from "vitest";
import {
  expandSeries,
  todoApplyRecurrenceChange,
  todoSetRecurrence,
  todoSkipSeriesFuture,
  todosRevertChanges,
  topUpSeries,
} from "../src/logic/derive";
import { planMochiOps, type MochiSnapshot } from "../src/logic/mochiOps";
import type { Todo } from "../src/domain/types";

const TODAY = "2026-10-19";

function row(over: Partial<Todo> = {}): Todo {
  return {
    id: "head",
    text: "Walk",
    done: false,
    priority: "medium",
    dueDate: TODAY,
    trashed: false,
    updatedAt: 1,
    recurrence: { freq: "daily" },
    ...over,
  };
}
const series = (ts: Todo[], sid = "s") => ts.filter((t) => t.seriesId === sid);
/** Daily series head (Mon 10-19, id "head") + s_10-20 … s_10-26. */
const daily = () => expandSeries(row({ seriesId: "s" }), TODAY);
const MT = "2026-11-30";
const stamped = (ts: Todo[]) => ts.map((t) => (t.recurrence ? { ...t, recurrence: { ...t.recurrence, materializedThrough: MT } } : t));
describe("rt8 horizon clearing", () => {
  it("K1 rule change on a LATER member clears the horizon on kept earlier members and the target (C10/C11)", () => {
    const ts = stamped(daily());
    const tgt = ts.find((t) => t.id === "s_2026-10-22")!;
    const r = todoApplyRecurrenceChange(ts, tgt.id, { ...tgt.recurrence!, freq: "weekly" }, TODAY);
    expect(series(r.next).every((t) => t.recurrence?.materializedThrough === undefined)).toBe(true);
  });
  it("K2 todoSetRecurrence drops an incoming horizon (C33)", () => {
    const ts = [row({ id: "a", seriesId: undefined, recurrence: undefined })];
    const out = todoSetRecurrence(ts, "a", { freq: "weekly", materializedThrough: MT });
    expect(out[0].recurrence?.materializedThrough).toBeUndefined();
  });
  it("K3 same-rule resume clears the horizon; a still-past end keeps it (C12/C13)", () => {
    const ended = stamped(daily()).map((t) => ({ ...t, recurrence: { ...t.recurrence!, endDate: "2026-10-10" } }));
    const resumed = todoApplyRecurrenceChange(ended, "head", { freq: "daily" }, TODAY);
    expect(series(resumed.next).every((t) => t.recurrence?.materializedThrough === undefined)).toBe(true);
    const stillEnded = todoApplyRecurrenceChange(ended, "head", { freq: "daily", endDate: "2026-10-12" }, TODAY);
    expect(series(stillEnded.next).some((t) => t.recurrence?.materializedThrough === MT)).toBe(true);
  });
});
describe("rt8 resume guards", () => {
  const skippedSeries = () => todoSkipSeriesFuture(expandSeries(row({ seriesId: "s", dueDate: "2026-10-18" }), "2026-10-18"), "s_2026-10-19", TODAY).next;
  it("K4 a new rule that still ends in the past is not a resume — binned future rows stay (C6)", () => {
    const s = skippedSeries();
    const r = todoApplyRecurrenceChange(s, "head", { freq: "daily", interval: 2, endDate: "2026-10-18" }, TODAY, { keepDetached: true });
    expect(r.next.some((t) => t.id === "s_2026-10-21")).toBe(true);
  });
  it("K5 resume keeps a DONE row binned after today (C8)", () => {
    const s = skippedSeries().map((t) => (t.id === "s_2026-10-21" ? { ...t, done: true } : t));
    const r = todoApplyRecurrenceChange(s, "head", { freq: "daily", interval: 2 }, TODAY, { keepDetached: true });
    expect(r.next.some((t) => t.id === "s_2026-10-21" && t.done)).toBe(true);
  });
});
describe("rt8 rule-change Undo keeps user rows", () => {
  const setup = () => {
    const before = daily();
    const after = todoApplyRecurrenceChange(before, "head", { freq: "weekly" }, TODAY).next;
    const later = topUpSeries(after, "s", "2026-10-26");
    const app = later.find((t) => !after.some((a) => a.id === t.id))!;
    return { before, after, later, app };
  };
  it("K6 an appended row completed since survives the Undo (C40)", () => {
    const { before, after, later, app } = setup();
    const done = later.map((t) => (t.id === app.id ? { ...t, done: true } : t));
    expect(todosRevertChanges(done, before, after).some((t) => t.id === app.id)).toBe(true);
  });
  it("K7 an appended row binned since survives the Undo (C41)", () => {
    const { before, after, later, app } = setup();
    const binned = later.map((t) => (t.id === app.id ? { ...t, trashed: true } : t));
    expect(todosRevertChanges(binned, before, after).some((t) => t.id === app.id)).toBe(true);
  });
  it("K8 a non-generated row in the series survives (C42)", () => {
    const { before, after, later, app } = setup();
    const manual = later.map((t) => (t.id === app.id ? { ...t, id: "manual-1" } : t));
    expect(todosRevertChanges(manual, before, after).some((t) => t.id === "manual-1")).toBe(true);
  });
  it("K9 an appended row already on the restored rule survives (C43)", () => {
    const { before, after, later, app } = setup();
    const daily1 = later.map((t) => (t.id === app.id ? { ...t, recurrence: { freq: "daily" as const } } : t));
    expect(todosRevertChanges(daily1, before, after).some((t) => t.id === app.id)).toBe(true);
  });
});
describe("rt8 reminderKeys", () => {
  const snap: MochiSnapshot = {
    today: TODAY,
    todos: [{ id: "a", text: "Walk", done: false, dueDate: TODAY, priority: "high",
      reminders: [{ at: "2026-10-19T09:00" }, { at: "2026-10-19T18:00", intervalMinutes: 30 }] }],
    categories: [], groceries: [],
  };
  const plan = (args: Record<string, unknown>) =>
    planMochiOps([{ kind: "editTodo", args: { todoId: "a", ...args } } as never], snap, { genId: () => "id" });
  it("K10 same reminders in another order are a no-op (C66)", () => {
    expect(plan({ reminders: [{ at: "2026-10-19T18:00", intervalMinutes: 30 }, { at: "2026-10-19T09:00" }] })).toEqual([]);
  });
  it("K11 changing only the nag interval is a real edit (C67)", () => {
    expect(plan({ reminders: [{ at: "2026-10-19T09:00" }, { at: "2026-10-19T18:00", intervalMinutes: 60 }] }).map((o: { type: string }) => o.type)).toEqual(["updateReminders"]);
  });
});
