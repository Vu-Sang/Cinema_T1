import assert from "node:assert/strict";
import { test } from "node:test";
import { correction, expectedPosition, parseYouTubeId } from "../shared/sync.ts";

test("expectedPosition follows the server clock while playing", () => {
  assert.equal(expectedPosition({ status: "playing", position: 100, updatedAt: 1000 }, 3500), 102.5);
});

test("expectedPosition holds still while paused", () => {
  assert.equal(expectedPosition({ status: "paused", position: 100, updatedAt: 1000 }, 9000), 100);
});

test("expectedPosition never goes backwards when the client clock is behind", () => {
  assert.equal(expectedPosition({ status: "playing", position: 100, updatedAt: 5000 }, 4000), 100);
});

test("correction seeks on large drift and nudges the rate on small drift", () => {
  assert.deepEqual(correction(3), { kind: "seek" });
  assert.deepEqual(correction(-2), { kind: "seek" });
  assert.deepEqual(correction(0.5), { kind: "rate", rate: 0.95 });
  assert.deepEqual(correction(-0.5), { kind: "rate", rate: 1.05 });
  assert.deepEqual(correction(0.1), { kind: "rate", rate: 1 });
});

test("parseYouTubeId accepts common link shapes and rejects others", () => {
  const id = "teEg78HrYSw";
  for (const url of [
    id,
    `https://www.youtube.com/watch?v=${id}&t=30`,
    `https://youtu.be/${id}`,
    `https://www.youtube.com/live/${id}?si=x`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/embed/${id}`,
  ]) {
    assert.equal(parseYouTubeId(url), id, url);
  }
  assert.equal(parseYouTubeId("https://evil.example/watch?v=teEg78HrYSw"), null);
  assert.equal(parseYouTubeId("https://www.youtube.com/watch?v=short"), null);
  assert.equal(parseYouTubeId("không phải link"), null);
});
