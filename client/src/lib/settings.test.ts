import { beforeEach, expect, test } from "vitest";
import { DEFAULT_UPLOAD_CONCURRENCY, MAX_UPLOAD_CONCURRENCY, MIN_UPLOAD_CONCURRENCY, getUploadConcurrency, setUploadConcurrency } from "./settings";

beforeEach(() => {
  localStorage.removeItem("mstor_upload_concurrency");
});

test("默认并发 3", () => {
  expect(DEFAULT_UPLOAD_CONCURRENCY).toBe(3);
  expect(getUploadConcurrency()).toBe(3);
});

test("非法值回退默认", () => {
  localStorage.setItem("mstor_upload_concurrency", "abc");
  expect(getUploadConcurrency()).toBe(3);
});

test("越界值 clamp 到 [1, 16]", () => {
  localStorage.setItem("mstor_upload_concurrency", "0");
  expect(getUploadConcurrency()).toBe(MIN_UPLOAD_CONCURRENCY);
  localStorage.setItem("mstor_upload_concurrency", "99");
  expect(getUploadConcurrency()).toBe(MAX_UPLOAD_CONCURRENCY);
  expect(MAX_UPLOAD_CONCURRENCY).toBe(16);
});

test("set/get 往返", () => {
  setUploadConcurrency(8);
  expect(getUploadConcurrency()).toBe(8);
  setUploadConcurrency(16);
  expect(getUploadConcurrency()).toBe(16);
});
