import { describe, it, expect } from "vitest";
import { ScopiumObject, ScopiumLink } from "@scopium/ontology";
import { SyntheticCompaniesConnector } from "../synthetic-companies";

describe("SyntheticCompaniesConnector", () => {
  it("produces ontology-valid companies, persons, and DirectorOf links", async () => {
    const connector = new SyntheticCompaniesConnector({ count: 5, seed: 1 });
    const objs: any[] = [];
    const lnks: any[] = [];
    const res = await connector.sync({
      fetchedBy: "test",
      emit: b => { objs.push(...b.objects); lnks.push(...b.links); },
    });

    expect(res.objectsEmitted).toBeGreaterThanOrEqual(5);
    expect(lnks.length).toBeGreaterThan(0);
    expect(objs.filter(o => o.type === "NZCompany").length).toBe(5);

    // Validate every emitted record against the ontology.
    for (const o of objs) expect(ScopiumObject.parse(o)).toBeTruthy();
    for (const l of lnks) expect(ScopiumLink.parse(l)).toBeTruthy();
  });

  it("is deterministic for a given seed", async () => {
    const collect = async () => {
      const c = new SyntheticCompaniesConnector({ count: 3, seed: 42 });
      const out: string[] = [];
      await c.sync({ emit: b => { for (const o of b.objects) if (o.type === "NZCompany") out.push((o.properties as any).nzbn); } });
      return out;
    };
    expect(await collect()).toEqual(await collect());
  });
});
