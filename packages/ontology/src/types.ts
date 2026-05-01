import { z } from "zod";
import { Classification } from "./classification";
import { ProvenanceRecord } from "./provenance";

/** ---------- Shared primitives ---------- */

export const ISODate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const ISODateTime = z.string().datetime();

export const GeoPoint = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  /** Source CRS — NZTM2000 (EPSG:2193) preserved when supplied; lat/lon always WGS84. */
  sourceCrs: z.enum(["EPSG:4326", "EPSG:2193"]).default("EPSG:4326"),
});
export type GeoPoint = z.infer<typeof GeoPoint>;

const ObjectMeta = z.object({
  id: z.string().describe("Stable Scopium object id (ulid)"),
  classification: Classification.default("Public"),
  provenance: ProvenanceRecord,
  createdAt: ISODateTime,
  updatedAt: ISODateTime,
});

const objectType = <T extends string, P extends z.ZodRawShape>(type: T, props: P) =>
  ObjectMeta.extend({ type: z.literal(type), properties: z.object(props) });

/** ---------- Base object types ---------- */

export const Person = objectType("Person", {
  fullName: z.string(),
  givenNames: z.string().optional(),
  familyName: z.string().optional(),
  /** Te reo name with macrons preserved end-to-end. */
  teReoName: z.string().optional(),
  dateOfBirth: ISODate.optional(),
  /** Optional residential locality, not full address — privacy by default. */
  residentialLocality: z.string().optional(),
});

export const Organisation = objectType("Organisation", {
  name: z.string(),
  /** Free-form sector tag. NZ industries map via ANZSIC06 in subtypes. */
  sector: z.string().optional(),
  website: z.string().url().optional(),
});

export const Location = objectType("Location", {
  name: z.string(),
  teReoName: z.string().optional(),
  point: GeoPoint.optional(),
  /** WKT polygon for boundaries; preserved in source CRS via meta.crs. */
  boundaryWkt: z.string().optional(),
});

export const Asset = objectType("Asset", {
  name: z.string(),
  assetClass: z.enum(["RealProperty", "Vehicle", "Vessel", "Aircraft", "Intangible", "Other"]),
  identifier: z.string().optional(),
});

export const Event = objectType("Event", {
  title: z.string(),
  occurredAt: ISODateTime,
  endedAt: ISODateTime.optional(),
  description: z.string().optional(),
});

export const Transaction = objectType("Transaction", {
  amountNzd: z.number(),
  occurredAt: ISODateTime,
  description: z.string().optional(),
  reference: z.string().optional(),
});

export const Document = objectType("Document", {
  title: z.string(),
  mimeType: z.string(),
  url: z.string().url().optional(),
  publishedAt: ISODateTime.optional(),
  /** Used by the AI assistant for retrieval; pgvector-backed. */
  embeddingModel: z.string().optional(),
});

/** ---------- NZ-specific subtypes ---------- */

export const NZCompany = objectType("NZCompany", {
  name: z.string(),
  /** New Zealand Business Number (13 digits). Primary key. */
  nzbn: z.string().regex(/^\d{13}$/),
  /** Companies Register number, e.g. "1234567". */
  companyNumber: z.string(),
  status: z.enum(["Registered", "InLiquidation", "Removed", "InReceivership", "Other"]),
  incorporationDate: ISODate.optional(),
  anzsic: z.string().optional(),
  registeredOffice: z.string().optional(),
});

export const Iwi = objectType("Iwi", {
  name: z.string(),
  teReoName: z.string(),
  region: z.string().optional(),
});

export const Hapu = objectType("Hapū", {
  name: z.string(),
  teReoName: z.string(),
  iwiId: z.string().optional(),
});

export const RegionalCouncil = objectType("RegionalCouncil", {
  name: z.string(),
  teReoName: z.string().optional(),
  /** Stats NZ Regional Council code (REGC2023). */
  regcCode: z.string(),
});

export const TerritorialAuthority = objectType("TerritorialAuthority", {
  name: z.string(),
  teReoName: z.string().optional(),
  /** Stats NZ Territorial Authority code (TA2023). */
  taCode: z.string(),
});

export const Suburb = objectType("Suburb", {
  name: z.string(),
  teReoName: z.string().optional(),
  taCode: z.string().optional(),
});

export const LINZParcel = objectType("LINZParcel", {
  /** LINZ parcel ID. */
  parcelId: z.string(),
  appellation: z.string().optional(),
  areaSqm: z.number().optional(),
  titleReference: z.string().optional(),
});

/** ---------- Discriminated union of every object type ---------- */

export const ScopiumObject = z.discriminatedUnion("type", [
  Person,
  Organisation,
  Location,
  Asset,
  Event,
  Transaction,
  Document,
  NZCompany,
  Iwi,
  Hapu,
  RegionalCouncil,
  TerritorialAuthority,
  Suburb,
  LINZParcel,
]);
export type ScopiumObject = z.infer<typeof ScopiumObject>;
export type ScopiumObjectType = ScopiumObject["type"];

export const OBJECT_TYPES = [
  "Person",
  "Organisation",
  "Location",
  "Asset",
  "Event",
  "Transaction",
  "Document",
  "NZCompany",
  "Iwi",
  "Hapū",
  "RegionalCouncil",
  "TerritorialAuthority",
  "Suburb",
  "LINZParcel",
] as const satisfies readonly ScopiumObjectType[];

/** ---------- Links (first-class typed edges) ---------- */

const LinkMeta = z.object({
  id: z.string(),
  fromId: z.string(),
  toId: z.string(),
  classification: Classification.default("Public"),
  provenance: ProvenanceRecord,
  createdAt: ISODateTime,
  updatedAt: ISODateTime,
});

const linkType = <T extends string, P extends z.ZodRawShape>(type: T, props: P) =>
  LinkMeta.extend({ type: z.literal(type), properties: z.object(props) });

export const DirectorOf = linkType("DirectorOf", {
  startDate: ISODate.optional(),
  endDate: ISODate.optional(),
  appointmentSource: z.string().describe("e.g. 'Companies Register' or specific filing"),
});

export const ShareholderOf = linkType("ShareholderOf", {
  shares: z.number().int().nonnegative().optional(),
  percentage: z.number().min(0).max(100).optional(),
  asAtDate: ISODate.optional(),
});

export const RegisteredAt = linkType("RegisteredAt", {
  asAtDate: ISODate.optional(),
});

export const LocatedIn = linkType("LocatedIn", {
  /** Containment relationship (suburb in TA, TA in regional council, etc.). */
  asAtDate: ISODate.optional(),
});

export const PartyTo = linkType("PartyTo", {
  role: z.enum(["Sender", "Receiver", "Counterparty"]),
});

export const Owns = linkType("Owns", {
  startDate: ISODate.optional(),
  endDate: ISODate.optional(),
  share: z.number().min(0).max(100).optional(),
});

export const MentionedIn = linkType("MentionedIn", {
  span: z.tuple([z.number().int(), z.number().int()]).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const ScopiumLink = z.discriminatedUnion("type", [
  DirectorOf,
  ShareholderOf,
  RegisteredAt,
  LocatedIn,
  PartyTo,
  Owns,
  MentionedIn,
]);
export type ScopiumLink = z.infer<typeof ScopiumLink>;
export type ScopiumLinkType = ScopiumLink["type"];

export const LINK_TYPES = [
  "DirectorOf",
  "ShareholderOf",
  "RegisteredAt",
  "LocatedIn",
  "PartyTo",
  "Owns",
  "MentionedIn",
] as const satisfies readonly ScopiumLinkType[];
