import type { Asset, SoftwareItem } from "../types";

export const SCHEMA_VERSION: number;

export const HW_CSV_COLUMNS: readonly string[];
export const SW_CSV_COLUMNS: readonly string[];

export function emptyAsset(id?: string): Asset;
export function emptySoftware(id?: string): SoftwareItem;
export function asList<T>(value: T[] | unknown): T[];
export function normalizeAsset(row: unknown, index?: number): Asset;
export function normalizeSoftware(row: unknown, index?: number): SoftwareItem;
export function ensureInventory<T>(pkg: T): T & { schemaVersion: number; assets: Asset[]; software: SoftwareItem[] };
export function seedSldssAssets(): Asset[];
export function seedSldssSoftware(): SoftwareItem[];
export function hardwareCsv(assets: Asset[] | unknown): string;
export function softwareCsv(software: SoftwareItem[] | unknown): string;
