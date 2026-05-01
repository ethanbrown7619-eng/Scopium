import { describe, it, expect } from "vitest";
import { QueryAst, compile } from "../index";

describe("compile", () => {
  it("compiles a simple property filter", () => {
    const ast = QueryAst.parse({
      from: "NZCompany",
      where: [{ kind: "property", field: "status", op: "eq", value: "Registered" }],
      limit: 10,
    });
    const c = compile(ast);
    expect(c.sql).toMatch(/FROM objects o/);
    expect(c.sql).toMatch(/o\.type = \$1/);
    expect(c.params).toEqual(["NZCompany", "status", "Registered", 10]);
    expect(c.shape).toBe("objects");
  });

  it("compiles a count aggregation", () => {
    const ast = QueryAst.parse({
      from: "NZCompany",
      aggregate: { fn: "count" },
    });
    const c = compile(ast);
    expect(c.sql).toMatch(/COUNT\(/);
    expect(c.shape).toBe("aggregate");
  });

  it("compiles a multi-hop traversal", () => {
    const ast = QueryAst.parse({
      from: "Person",
      where: [{ kind: "property", field: "fullName", op: "contains", value: "Smith" }],
      traverse: [{ via: "DirectorOf", direction: "outgoing", depth: 2, where: [] }],
    });
    const c = compile(ast);
    expect(c.sql).toMatch(/WITH RECURSIVE/);
    expect(c.sql).toMatch(/hop_0/);
  });
});
