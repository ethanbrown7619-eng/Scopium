import { describe, it, expect } from "vitest";
import { canonicalName, blockingKey, scorePersonMatch, sanitiseAddress, displayDob } from "../index";

describe("name normalisation", () => {
  it("reorders surname-first names", () => {
    expect(canonicalName("SMITH, John Andrew")).toBe("john andrew smith");
    expect(canonicalName("John Smith")).toBe("john smith");
  });
  it("strips macrons for comparison", () => {
    expect(canonicalName("Tāne Māhuta")).toBe("tane mahuta");
  });
  it("blocks on surname + first initial", () => {
    expect(blockingKey("John Andrew Smith")).toBe("smith:j");
    expect(blockingKey("SMITH, Jane")).toBe("smith:j");
  });
});

describe("scorePersonMatch", () => {
  it("auto-merges on exact name + DOB", () => {
    const r = scorePersonMatch(
      { fullName: "John Andrew Smith", dateOfBirth: "1980-05-01" },
      { fullName: "SMITH, John Andrew", dateOfBirth: "1980-05-01" },
    );
    expect(r.autoMerge).toBe(true);
    expect(r.method).toBe("deterministic");
    expect(r.signals).toContain("dob-match");
  });

  it("auto-merges on exact name + shared locality + shared entity", () => {
    const r = scorePersonMatch(
      { fullName: "Jane Doe", residentialLocality: "Wellington", linkedEntityIds: ["co-1"] },
      { fullName: "Jane Doe", residentialLocality: "Wellington", linkedEntityIds: ["co-1", "co-2"] },
    );
    expect(r.autoMerge).toBe(true);
  });

  it("does NOT auto-merge two J Smiths with no corroboration", () => {
    const r = scorePersonMatch(
      { fullName: "John Smith" },
      { fullName: "John Smith" },
    );
    expect(r.autoMerge).toBe(false);
    expect(r.method).toBe("probabilistic");
  });

  it("scores partial DOB prefixes as a match", () => {
    const r = scorePersonMatch(
      { fullName: "A B", dateOfBirth: "1975" },
      { fullName: "A B", dateOfBirth: "1975-03-12" },
    );
    expect(r.signals).toContain("dob-match");
  });
});

describe("privacy helpers", () => {
  it("reduces a full address to a coarse locality", () => {
    expect(sanitiseAddress("12 Queen Street, Auckland 1010")).toBe("Auckland");
    expect(sanitiseAddress("45 Someplace Rd, Karori, Wellington")).toBe("Wellington");
  });
  it("drops addresses with no recognisable locality", () => {
    expect(sanitiseAddress("12 Nowhere Lane 9999")).toBeUndefined();
    expect(sanitiseAddress(undefined)).toBeUndefined();
  });
  it("coarsens DOB to a year for display", () => {
    expect(displayDob("1980-05-01")).toBe("1980");
    expect(displayDob(undefined)).toBeUndefined();
  });
});
