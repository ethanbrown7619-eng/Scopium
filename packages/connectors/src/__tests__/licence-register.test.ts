import { describe, it, expect } from "vitest";
import { ScopiumObject, ScopiumLink } from "@scopium/ontology";
import { LicenceRegisterConnector, LICENCE_REGISTERS } from "../licence-register";

const fakeFetch = (payload: unknown): typeof fetch =>
  (async () => new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } })) as any;

describe("LicenceRegisterConnector", () => {
  it("materialises a Person + Credential + Holds from an LBP-style register", async () => {
    const connector = new LicenceRegisterConnector({
      descriptor: LICENCE_REGISTERS.lbp!,
      query: "Smith",
      limit: 5,
      fetchImpl: fakeFetch({
        items: [
          { fullName: "John Smith", lbpNumber: "BP123456", status: "Current", licenceClasses: ["Carpentry", "Site AOP 2"], city: "Hamilton" },
        ],
      }),
    });

    const objects: any[] = [];
    const links: any[] = [];
    const res = await connector.sync({
      fetchedBy: "test",
      emit: b => { objects.push(...b.objects); links.push(...b.links); },
    });

    expect(res.objectsEmitted).toBe(2);
    for (const o of objects) expect(ScopiumObject.parse(o)).toBeTruthy();
    for (const l of links) expect(ScopiumLink.parse(l)).toBeTruthy();

    const person = objects.find(o => o.type === "Person");
    expect(person.properties.fullName).toBe("John Smith");
    expect(person.properties.occupation).toBe("Licensed Building Practitioner");
    expect(person.properties.sourceScoped).toBe(true);

    const cred = objects.find(o => o.type === "Credential");
    expect(cred.properties.licenceNumber).toBe("BP123456");
    expect(cred.properties.status).toBe("Current");
    expect(cred.properties.register).toBe("Licensed Building Practitioners Board");

    expect(links[0].type).toBe("Holds");
    expect(links[0].fromId).toBe(person.id);
    expect(links[0].toId).toBe(cred.id);
  });

  it("exposes descriptors for the free public licence registers", () => {
    const keys = Object.keys(LICENCE_REGISTERS);
    for (const expected of ["lbp", "rea", "fspr", "lawyers", "doctors", "nurses", "teachers", "immigration", "pgdb", "ewrb"]) {
      expect(keys).toContain(expected);
    }
  });
});
