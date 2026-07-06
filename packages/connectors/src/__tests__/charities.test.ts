import { describe, it, expect } from "vitest";
import { ScopiumObject, ScopiumLink } from "@scopium/ontology";
import { CharitiesConnector } from "../charities";

const fakeFetch = (payload: unknown): typeof fetch =>
  (async () => new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } })) as any;

describe("CharitiesConnector", () => {
  it("materialises charities as Organisations and officers as source-scoped Persons with OfficerOf links", async () => {
    const connector = new CharitiesConnector({
      limit: 2,
      fetchImpl: fakeFetch({
        value: [{
          CharityRegistrationNumber: "CC12345",
          Name: "Kaimai Trust",
          Officers: [
            { FullName: "Aroha Ngata", Position: "Trustee", Address: "5 Some St, Tauranga" },
            { FirstName: "John", LastName: "Smith", Position: "Chairperson" },
          ],
        }],
      }),
    });

    const objects: any[] = [];
    const links: any[] = [];
    const raws: any[] = [];
    const res = await connector.sync({
      fetchedBy: "test",
      emit: b => { objects.push(...b.objects); links.push(...b.links); },
      emitRaw: r => { raws.push(r); },
    });

    expect(res.objectsEmitted).toBe(3); // 1 org + 2 officers
    for (const o of objects) expect(ScopiumObject.parse(o)).toBeTruthy();
    for (const l of links) expect(ScopiumLink.parse(l)).toBeTruthy();

    const org = objects.find(o => o.type === "Organisation");
    expect(org.properties.name).toBe("Kaimai Trust");

    const aroha = objects.find(o => o.type === "Person" && o.properties.fullName === "Aroha Ngata");
    expect(aroha.properties.sourceScoped).toBe(true);
    // Address sanitised to locality only — no street number retained.
    expect(aroha.properties.residentialLocality).toBe("Tauranga");

    expect(links.every(l => l.type === "OfficerOf")).toBe(true);
    // Raw capture recorded for the two-phase landing zone.
    expect(raws).toHaveLength(1);
    expect(raws[0].sourceId).toBe("charity:CC12345");
  });
});
