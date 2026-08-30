import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { importStandardContent, importStandardFile } from "./import-file.js";

const directories: string[] = [];
afterEach(() => { while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true }); });

const setup = () => { const directory = mkdtempSync(join(tmpdir(), "daily-chief-import-")); directories.push(directory); return directory; };
const base = { sourceId: "file.fixture", timezone: "Asia/Shanghai", now: new Date("2026-08-27T00:00:00Z") };

describe("standard file import", () => {
  it("imports Markdown checkboxes", () => {
    const path = join(setup(), "tasks.md");
    writeFileSync(path, "# Tasks\n- [ ] 待处理\n- [x] 已完成\n");
    const result = importStandardFile({ ...base, path });
    expect(result.items.map((item) => item.status)).toEqual(["inbox", "done"]);
  });

  it("imports CSV rows", () => {
    const path = join(setup(), "tasks.csv");
    writeFileSync(path, "title,status,priority,estimate_minutes\n准备会议,next,p1,45\n");
    const result = importStandardFile({ ...base, path });
    expect(result.items[0]).toMatchObject({ title: "准备会议", status: "next", priority: "p1", estimate_minutes: 45 });
  });

  it("imports an ICS event", () => {
    const path = join(setup(), "calendar.ics");
    writeFileSync(path, "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:event-1\r\nDTSTART:20260827T020000Z\r\nDTEND:20260827T030000Z\r\nSUMMARY:固定会议\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n");
    const result = importStandardFile({ ...base, path });
    expect(result.capability).toBe("calendar.read");
    expect(result.items[0]).toMatchObject({ title: "固定会议", kind: "event" });
  });

  it("imports browser-provided content without persisting a temporary original", () => {
    const result = importStandardContent({ ...base, filename: "tasks.csv", content: "title,status\n网页导入,next\n" });
    expect(result.items[0]).toMatchObject({ title: "网页导入", status: "next" });
  });
});
