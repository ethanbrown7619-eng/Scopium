import { describe, it, expect } from "vitest";
import { ScopiumObject, ScopiumLink } from "@scopium/ontology";
import { DisqualifiedDirectorsConnector } from "../disqualified-directors";

const fakeFetch = (payload: unknown): typeof fetch =>
  (async () => new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } })) as any;

describe("DisqualifiedDirectorsConnector", () => {
  it("materialises person + disqualification events + associated companies", async () => {
    const connector = new DisqualifiedDirectorsConnector({
      apiKey: "test", query: "Bloggs", limit: 10,
      fetchImpl: fakeFetch({
        totalResults: 1,
        roles: [{
          firstName: "Jo", middleName: "Martin", lastName: "BLOGGS",
          disqualifiedDirectorId: 12345678,
          addresses: [{ addressLines: ["12 Some St", "Ponsonby", "Auckland"], countryCode: "NZ" }],
          associations: { associations: [{ associatedCompanyNumber: 1234567, associatedCompanyName: "ACME LIMITED", associatedCompanyNzbn: 9429000000001 }] },
          disqualificationCriteria: { criteria: [{ startDate: "2015-08-02", criteria: "Section 299 Insolvency Act 2006", endDate: "2019-08-10" }] },
          aliases: { aliases: ["BLOGGS, Jo Martin"] },
        }],
      }),
    });

    const objects: any[] = [];
    const links: any[] = [];
    const res = await connector.sync({ fetchedBy: "test", emit: b => { objects.push(...b.objects); links.push(...b.links); } });

    expect(res.objectsEmitted).toBe(3); // person + event + company
    for (const o of objects) expect(ScopiumObject.parse(o)).toBeTruthy();
    for (const l of links) expect(ScopiumLink.parse(l)).toBeTruthy();

    const person = objects.find(o => o.type === "Person");
    expect(person.properties.fullName).toBe("Jo Martin BLOGGS");
    // Address sanitised to locality — no street retained.
    expect(person.properties.residentialLocality).toBe("Auckland");
    expect(person.properties.aliases).toContain("BLOGGS, Jo Martin");

    expect(objects.find(o => o.type === "Event").properties.title).toContain("disqualification");
    expect(objects.find(o => o.type === "NZCompany").properties.name).toBe("ACME LIMITED");
    expect(links.map(l => l.type).sort()).toEqual(["DirectorOf", "PartyTo"]);
  });
});
