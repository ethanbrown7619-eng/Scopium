import { describe, it, expect } from "vitest";
import { NZCompaniesRegisterConnector } from "../index";

const mockFetch = (handlers: Record<string, unknown>): typeof fetch =>
  (async (input: any) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [pattern, body] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      }
    }
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;

describe("NZCompaniesRegisterConnector", () => {
  it("materialises companies, directors, and shareholders with provenance", async () => {
    const fetchImpl = mockFetch({
      "/companies?": {
        items: [{
          nzbn: "9429000000001",
          companyNumber: "1234567",
          entityName: "Aotearoa Widgets Ltd",
          entityStatusCode: "Registered",
          incorporationDate: "2010-01-15",
        }],
        totalItems: 1,
      },
      "/directors": [{
        firstName: "Aroha", lastName: "Smith",
        appointmentDate: "2010-02-01",
        residentialAddress: { city: "Wellington" },
      }],
      "/shareholdings": [{
        allocations: [{
          shares: 100, percentage: 100,
          shareholders: [{ name: "Aroha Smith" }],
        }],
      }],
    });

    const connector = new NZCompaniesRegisterConnector({
      baseUrl: "https://api.example/companies/v1", limit: 1, fetchImpl,
    });

    const collected: any[] = [];
    const res = await connector.sync({ emit: async b => { collected.push(b); }, fetchedBy: "test" });

    expect(res.objectsEmitted).toBeGreaterThanOrEqual(2);
    const flat = collected.flatMap(b => b.objects);
    expect(flat.find((o: any) => o.type === "NZCompany").properties.nzbn).toBe("9429000000001");
    expect(flat.find((o: any) => o.type === "Person").properties.fullName).toBe("Aroha Smith");
    const links = collected.flatMap(b => b.links);
    expect(links.find((l: any) => l.type === "DirectorOf")).toBeTruthy();
    expect(links.find((l: any) => l.type === "ShareholderOf")).toBeTruthy();
    expect(flat[0].provenance.connectorId).toBe("nz-companies-register");
  });
});
