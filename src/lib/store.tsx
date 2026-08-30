import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { buildSamplePackage, hydratePackage, retargetControls } from "../data/sample";
import type { AaPackage } from "../types";

type Store = {
  pkg: AaPackage;
  loading: boolean;
  saving: boolean;
  lastSaved: string | null;
  error: string | null;
  setPackage: (updater: (current: AaPackage) => AaPackage) => void;
  loadSample: () => void;
  retargetFromIntake: () => void;
};

const Ctx = createContext<Store | null>(null);

export function reportPackageAccess(action: "export" | "reload-sample", bytes = 0) {
  if (action !== "export" && action !== "reload-sample") return;
  const n = typeof bytes === "number" && Number.isFinite(bytes) && bytes >= 0 ? Math.floor(bytes) : 0;
  void fetch("/api/access-audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, outcome: "ok", bytesIn: 0, bytesOut: n }),
  }).catch(() => {});
}

async function fetchPackage(): Promise<AaPackage | null> {
  const res = await fetch("/api/package");
  if (!res.ok) throw new Error("Could not load package (HTTP " + res.status + ").");
  const data = await res.json();
  return data.package ?? null;
}

export function PackageProvider({ children }: { children: ReactNode }) {
  const [pkg, setPkg] = useState<AaPackage>(() => buildSamplePackage());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const skip = useRef(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const existing = await fetchPackage();
        if (cancelled) return;
        if (existing) setPkg(hydratePackage(existing));
        else {
          const sample = buildSamplePackage();
          setPkg(sample);
          await fetch("/api/package", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ package: sample }),
          });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (skip.current) {
      skip.current = false;
      return;
    }
    const t = setTimeout(() => {
      setSaving(true);
      fetch("/api/package", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: { ...pkg, updatedAt: new Date().toISOString() } }),
      })
        .then((r) => {
          if (!r.ok) {
            if (r.status === 400) throw new Error("Save rejected: inherited/hybrid controls need an inheritance source");
            throw new Error("Save failed");
          }
          setLastSaved(new Date().toLocaleTimeString());
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Save failed"))
        .finally(() => setSaving(false));
    }, 450);
    return () => clearTimeout(t);
  }, [pkg, loading]);

  const setPackage = useCallback((updater: (current: AaPackage) => AaPackage) => {
    setPkg((current) => updater(current));
  }, []);

  const loadSample = useCallback(() => {
    skip.current = false;
    const sample = buildSamplePackage();
    reportPackageAccess("reload-sample", new TextEncoder().encode(JSON.stringify(sample)).length);
    setPkg(sample);
  }, []);

  const retargetFromIntake = useCallback(() => {
    setPkg((current) => retargetControls(current));
  }, []);

  const value = useMemo(
    () => ({ pkg, loading, saving, lastSaved, error, setPackage, loadSample, retargetFromIntake }),
    [pkg, loading, saving, lastSaved, error, setPackage, loadSample, retargetFromIntake],
  );

  return createElement(Ctx.Provider, { value }, children);
}

export function usePackage(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePackage must be inside PackageProvider");
  return ctx;
}
