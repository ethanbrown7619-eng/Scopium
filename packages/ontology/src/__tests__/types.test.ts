import { describe, it, expect } from "vitest";
import { NZCompany, ScopiumObject, ontologySchemaForPrompt } from "../index";

const stamp = "2026-01-15T00:00:00.000Z";

describe("ontology", () => {
  it("validates a well-formed NZCompany", () => {
    const obj = NZCompany.parse({
      id: "01H...",
      type: "NZCompany",
      classification: "Public",
      provenance: {
        connectorId: "nz-companies-register",
        connectorVersion: "0.1.0",
        sourceId: "9429000000000",
        syncedAt: stamp,
      },
      createdAt: stamp,
      updatedAt: stamp,
      properties: {
        name: "Aotearoa Widgets Ltd",
        nzbn: "9429000000000",
        companyNumber: "1234567",
        status: "Registered",
      },
    });
    expect(obj.properties.name).toBe("Aotearoa Widgets Ltd");
  });

  it("rejects an NZBN that is not 13 digits", () => {
    expect(() =>
      NZCompany.parse({
        id: "x", type: "NZCompany", classification: "Public",
        provenance: { connectorId: "x", connectorVersion: "0.0.0", sourceId: "x", syncedAt: stamp },
        createdAt: stamp, updatedAt: stamp,
        properties: { name: "Bad", nzbn: "123", companyNumber: "1", status: "Registered" },
      })
    ).toThrow();
  });

  it("emits a non-empty schema summary for the system prompt", () => {
    const md = ontologySchemaForPrompt();
    expect(md).toContain("NZCompany");
    expect(md).toContain("DirectorOf");
  });

  it("ScopiumObject discriminates on type", () => {
    const result = ScopiumObject.safeParse({ type: "Nope" });
    expect(result.success).toBe(false);
  });
});
