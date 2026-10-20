import "vitest";

// vitest-axe 的 matcher 类型声明（包本身未提供 augmentation）
declare module "vitest" {
  interface Assertion<T = unknown> {
    toHaveNoViolations(): T;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void;
  }
}
