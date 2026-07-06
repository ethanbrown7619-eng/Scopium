/**
 * Schema introspection — emits a compact JSON description of the ontology
 * suitable for injection into the Claude system prompt. Keeping this compact
 * matters because it ships with every Ask request.
 */
import { z } from "zod";
import {
  Person, Organisation, Location, Asset, Event, Transaction, Document,
  NZCompany, Iwi, Hapu, RegionalCouncil, TerritorialAuthority, Suburb, LINZParcel, Credential,
  DirectorOf, ShareholderOf, RegisteredAt, LocatedIn, PartyTo, Owns, MentionedIn,
  OfficerOf, Holds, ProprietorOf, SameAs,
} from "./types";

type FieldDescriptor = { name: string; type: string; required: boolean; enum?: readonly string[] };

const describeShape = (shape: z.ZodRawShape): FieldDescriptor[] =>
  Object.entries(shape).map(([name, schema]) => {
    const def = (schema as z.ZodTypeAny)._def;
    let typeName = def.typeName ?? "unknown";
    let required = !(schema instanceof z.ZodOptional || schema instanceof z.ZodDefault);
    let enumValues: readonly string[] | undefined;
    let inner: z.ZodTypeAny = schema as z.ZodTypeAny;
    while (inner instanceof z.ZodOptional || inner instanceof z.ZodDefault) {
      inner = inner._def.innerType;
    }
    if (inner instanceof z.ZodEnum) {
      typeName = "enum";
      enumValues = inner._def.values;
    } else if (inner instanceof z.ZodString) typeName = "string";
    else if (inner instanceof z.ZodNumber) typeName = "number";
    else if (inner instanceof z.ZodBoolean) typeName = "boolean";
    else if (inner instanceof z.ZodObject) typeName = "object";
    return { name, type: typeName, required, ...(enumValues ? { enum: enumValues } : {}) };
  });

const describeObject = (schema: z.ZodObject<any>) => {
  const props = (schema.shape.properties as z.ZodObject<any>).shape as z.ZodRawShape;
  return {
    type: schema.shape.type._def.value as string,
    fields: describeShape(props),
  };
};

const describeLink = (schema: z.ZodObject<any>) => {
  const props = (schema.shape.properties as z.ZodObject<any>).shape as z.ZodRawShape;
  return {
    type: schema.shape.type._def.value as string,
    fields: describeShape(props),
  };
};

export type OntologySchemaSummary = {
  objects: ReturnType<typeof describeObject>[];
  links: ReturnType<typeof describeLink>[];
};

export const ontologySchemaSummary = (): OntologySchemaSummary => ({
  objects: [
    Person, Organisation, Location, Asset, Event, Transaction, Document,
    NZCompany, Iwi, Hapu, RegionalCouncil, TerritorialAuthority, Suburb, LINZParcel, Credential,
  ].map(describeObject),
  links: [
    DirectorOf, ShareholderOf, RegisteredAt, LocatedIn, PartyTo, Owns, MentionedIn,
    OfficerOf, Holds, ProprietorOf, SameAs,
  ].map(describeLink),
});

/** Render the schema as a compact, model-friendly markdown blob. */
export const ontologySchemaForPrompt = (): string => {
  const s = ontologySchemaSummary();
  const fmt = (f: FieldDescriptor) =>
    `${f.name}${f.required ? "" : "?"}: ${f.enum ? `enum(${f.enum.join("|")})` : f.type}`;
  const objects = s.objects.map(o => `- ${o.type}(${o.fields.map(fmt).join(", ")})`).join("\n");
  const links = s.links.map(l => `- ${l.type}(${l.fields.map(fmt).join(", ") || "no fields"})`).join("\n");
  return `# Object types\n${objects}\n\n# Link types\n${links}`;
};
