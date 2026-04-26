"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type {
  CaptionRun,
  HumorFlavor,
  HumorFlavorStep,
  Profile,
} from "@/lib/types";

type AdminPanel = "create-flavor" | "flavors" | "steps" | "test" | "runs";
type ThemeMode = "light" | "dark" | "system";

const API_BASE_URL = "https://api.almostcrackd.ai";
const LOCAL_RUNS_STORAGE_KEY = "humor-flavor-local-runs";
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
]);

export default function Page() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePanel, setActivePanel] = useState<AdminPanel>("create-flavor");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");

  const [flavors, setFlavors] = useState<HumorFlavor[]>([]);
  const [selectedFlavorId, setSelectedFlavorId] = useState<string>("");
  const [steps, setSteps] = useState<HumorFlavorStep[]>([]);
  const [runs, setRuns] = useState<CaptionRun[]>([]);
  const [runsTableAvailable, setRunsTableAvailable] = useState(true);

  const [newFlavorName, setNewFlavorName] = useState("");
  const [newFlavorDescription, setNewFlavorDescription] = useState("");
  const [confirmCreateFlavor, setConfirmCreateFlavor] = useState(false);
  const [createFlavorNotice, setCreateFlavorNotice] = useState("");
  const [flavorSearch, setFlavorSearch] = useState("");

  const [stepTitle, setStepTitle] = useState("");
  const [stepInstruction, setStepInstruction] = useState("");

  const [imageUrl, setImageUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageUploadName, setImageUploadName] = useState("");
  const [captionCount, setCaptionCount] = useState(5);
  const [status, setStatus] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStage, setGenerationStage] = useState("");

  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const selectedFlavor = flavors.find((flavor) => flavor.id === selectedFlavorId) ?? null;
  const filteredFlavors = useMemo(() => {
    const query = flavorSearch.trim().toLowerCase();
    if (!query) return flavors;
    return flavors.filter((flavor) => {
      const slugMatch = flavor.slug.toLowerCase().includes(query);
      const descriptionMatch = (flavor.description ?? "").toLowerCase().includes(query);
      return slugMatch || descriptionMatch;
    });
  }, [flavorSearch, flavors]);

  const hasImageInput = Boolean(selectedFile || imageUrl.trim());
  const canGenerate = Boolean(selectedFlavorId) && hasImageInput && !isGenerating;

  function extractCaptions(payload: unknown): string[] {
    const fromArray = (arr: unknown[]) =>
      arr
        .flatMap((item) => {
          if (typeof item === "string") return [item];
          if (!item || typeof item !== "object") return [];
          const obj = item as Record<string, unknown>;
          const direct = obj.content ?? obj.caption ?? obj.text;
          if (typeof direct === "string") return [direct];
          return extractCaptions(item);
        })
        .filter((text) => text.trim().length > 0);

    if (Array.isArray(payload)) return fromArray(payload);

    if (payload && typeof payload === "object") {
      const obj = payload as Record<string, unknown>;
      if (Array.isArray(obj.captions)) return fromArray(obj.captions);
      if (Array.isArray(obj.data)) return fromArray(obj.data);
      if (Array.isArray(obj.results)) return fromArray(obj.results);
    }

    return [];
  }

  function normalizeFlavorRow(row: Record<string, unknown>): HumorFlavor {
    return {
      id: String(row.id ?? ""),
      slug: String(row.slug ?? row.name ?? "(missing-slug)"),
      description: typeof row.description === "string" ? row.description : null,
      created_by_user_id: String(row.created_by_user_id ?? row.created_by ?? ""),
      modified_by_user_id: String(row.modified_by_user_id ?? row.modified_by ?? row.created_by ?? ""),
      created_datetime_utc: String(
        row.created_datetime_utc ?? row.created_at ?? new Date().toISOString(),
      ),
      modified_datetime_utc: String(
        row.modified_datetime_utc ??
          row.modified_at ??
          row.created_datetime_utc ??
          row.created_at ??
          new Date().toISOString(),
      ),
    };
  }

  function normalizeStepRow(row: Record<string, unknown>): HumorFlavorStep {
    const derivedTitle =
      row.title ??
      row.description ??
      row.llm_system_prompt ??
      row.llm_user_prompt ??
      "Untitled step";
    const derivedInstruction =
      row.instruction ??
      row.llm_user_prompt ??
      row.llm_system_prompt ??
      row.description ??
      "";
    const derivedSystemPrompt =
      row.llm_system_prompt ?? row.instruction ?? row.description ?? "";
    const derivedUserPrompt =
      row.llm_user_prompt ?? row.instruction ?? row.description ?? "";

    return {
      id: String(row.id ?? ""),
      flavor_id: String(row.flavor_id ?? row.humor_flavor_id ?? ""),
      position: Number(row.position ?? row.order_by ?? 0),
      title: String(derivedTitle),
      instruction: String(derivedInstruction),
      llm_system_prompt: String(derivedSystemPrompt),
      llm_user_prompt: String(derivedUserPrompt),
      created_by_user_id: String(row.created_by_user_id ?? row.created_by ?? ""),
      modified_by_user_id: String(row.modified_by_user_id ?? row.modified_by ?? row.created_by ?? ""),
      created_datetime_utc: String(
        row.created_datetime_utc ?? row.created_at ?? new Date().toISOString(),
      ),
      modified_datetime_utc: String(
        row.modified_datetime_utc ??
          row.modified_at ??
          row.created_datetime_utc ??
          row.created_at ??
          new Date().toISOString(),
      ),
    };
  }

  function normalizeRunRow(row: Record<string, unknown>): CaptionRun {
    return {
      id: String(row.id ?? ""),
      flavor_id: String(row.flavor_id ?? ""),
      image_url: String(row.image_url ?? ""),
      response_json: row.response_json ?? null,
      created_by_user_id: String(row.created_by_user_id ?? row.created_by ?? ""),
      modified_by_user_id: String(row.modified_by_user_id ?? row.modified_by ?? row.created_by ?? ""),
      created_datetime_utc: String(
        row.created_datetime_utc ?? row.created_at ?? new Date().toISOString(),
      ),
      modified_datetime_utc: String(
        row.modified_datetime_utc ??
          row.modified_at ??
          row.created_datetime_utc ??
          row.created_at ??
          new Date().toISOString(),
      ),
    };
  }

  function isColumnMissingError(errorMessage: string, columnName: string) {
    return (
      errorMessage.includes(`column \"${columnName}\"`) ||
      errorMessage.includes(`'${columnName}'`) ||
      errorMessage.includes(`\"${columnName}\"`)
    );
  }

  function formatTimestamp(value?: string) {
    if (!value) return "Unknown time";
    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) return "Unknown time";
    return timestamp.toLocaleString();
  }

  function readLocalRunsMap(): Record<string, CaptionRun[]> {
    try {
      const raw = localStorage.getItem(LOCAL_RUNS_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, CaptionRun[]>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveLocalRun(run: CaptionRun) {
    const runMap = readLocalRunsMap();
    const current = runMap[run.flavor_id] ?? [];
    const deduped = [run, ...current.filter((existing) => existing.id !== run.id)].slice(0, 20);
    runMap[run.flavor_id] = deduped;
    localStorage.setItem(LOCAL_RUNS_STORAGE_KEY, JSON.stringify(runMap));
  }

  function mergeRunsByNewest(primaryRuns: CaptionRun[], fallbackRuns: CaptionRun[]) {
    const byId = new Map<string, CaptionRun>();
    for (const run of [...primaryRuns, ...fallbackRuns]) {
      byId.set(run.id, run);
    }
    return [...byId.values()].sort((a, b) => {
      const aTime = new Date(a.created_datetime_utc ?? 0).getTime();
      const bTime = new Date(b.created_datetime_utc ?? 0).getTime();
      return bTime - aTime;
    });
  }

  const loadSteps = useCallback(
    async (flavorId: string) => {
      if (!supabase) return;

      const { data, error } = await supabase
        .from("humor_flavor_steps")
        .select("*")
        .eq("humor_flavor_id", flavorId)
        .order("order_by", { ascending: true });

      if (error) {
        if (
          isColumnMissingError(error.message, "humor_flavor_id") ||
          isColumnMissingError(error.message, "order_by")
        ) {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from("humor_flavor_steps")
            .select("*")
            .eq("flavor_id", flavorId)
            .order("position", { ascending: true });

          if (fallbackError) {
            setStatus(fallbackError.message);
            return;
          }

          const normalizedFallback = (fallbackData ?? []).map((row) =>
            normalizeStepRow(row as Record<string, unknown>),
          );
          setSteps(normalizedFallback);
          return;
        }

        setStatus(error.message);
        return;
      }

      const normalized = (data ?? []).map((row) => normalizeStepRow(row as Record<string, unknown>));
      setSteps(normalized);
    },
    [supabase],
  );

  const loadRuns = useCallback(
    async (flavorId: string) => {
      if (!supabase || !runsTableAvailable) return;

      const { data, error } = await supabase
        .from("humor_flavor_runs")
        .select("*")
        .eq("flavor_id", flavorId)
        .order("created_datetime_utc", { ascending: false })
        .limit(10);

      if (error) {
        if (isColumnMissingError(error.message, "created_datetime_utc")) {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from("humor_flavor_runs")
            .select("*")
            .eq("flavor_id", flavorId)
            .order("created_at", { ascending: false })
            .limit(10);

          if (fallbackError) {
            if (fallbackError.message.includes("humor_flavor_runs")) {
              setRunsTableAvailable(false);
              setRuns(readLocalRunsMap()[flavorId] ?? []);
              return;
            }
            setStatus(fallbackError.message);
            return;
          }

          const normalizedFallback = (fallbackData ?? []).map((row) =>
            normalizeRunRow(row as Record<string, unknown>),
          );
          const localRuns = readLocalRunsMap()[flavorId] ?? [];
          setRuns(mergeRunsByNewest(normalizedFallback, localRuns));
          return;
        }

        if (error.message.includes("humor_flavor_runs")) {
          setRunsTableAvailable(false);
          setRuns(readLocalRunsMap()[flavorId] ?? []);
          return;
        }
        setStatus(error.message);
        return;
      }

      const normalized = (data ?? []).map((row) => normalizeRunRow(row as Record<string, unknown>));
      const localRuns = readLocalRunsMap()[flavorId] ?? [];
      setRuns(mergeRunsByNewest(normalized, localRuns));
    },
    [supabase, runsTableAvailable],
  );

  const loadFlavors = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("humor_flavors")
      .select("*")
      .order("created_datetime_utc", { ascending: false });

    if (error) {
      if (isColumnMissingError(error.message, "created_datetime_utc")) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("humor_flavors")
          .select("*")
          .order("created_at", { ascending: false });

        if (fallbackError) {
          setStatus(fallbackError.message);
          return;
        }

        const fallbackNormalized = (fallbackData ?? []).map((row) =>
          normalizeFlavorRow(row as Record<string, unknown>),
        );

        setFlavors(fallbackNormalized);

        if (fallbackNormalized[0] && !selectedFlavorId) {
          setSelectedFlavorId(fallbackNormalized[0].id);
          await loadSteps(fallbackNormalized[0].id);
          await loadRuns(fallbackNormalized[0].id);
        }
        return;
      }

      setStatus(error.message);
      return;
    }

    const normalized = (data ?? []).map((row) =>
      normalizeFlavorRow(row as Record<string, unknown>),
    );

    setFlavors(normalized);

    if (normalized[0] && !selectedFlavorId) {
      setSelectedFlavorId(normalized[0].id);
      await loadSteps(normalized[0].id);
      await loadRuns(normalized[0].id);
    }
  }, [supabase, selectedFlavorId, loadSteps, loadRuns]);

  const loadProfile = useCallback(
    async (currentUser: User | null) => {
      if (!supabase || !currentUser) {
        setProfile(null);
        setFlavors([]);
        setSteps([]);
        setRuns([]);
        setSelectedFlavorId("");
        return;
      }

      const { data: profileData, error } = await supabase
        .from("profiles")
        .select("id, is_superadmin, is_matrix_admin")
        .eq("id", currentUser.id)
        .single();

      if (error) {
        setProfile(null);
        setStatus(`Profile lookup failed: ${error.message}`);
        return;
      }

      setProfile(profileData);

      if (profileData.is_superadmin || profileData.is_matrix_admin) {
        setStatus("Authenticated as admin.");
        await loadFlavors();
      } else {
        setStatus("Logged in, but account is not admin in profiles table.");
      }
    },
    [supabase, loadFlavors],
  );

  const init = useCallback(async () => {
    setLoading(true);

    if (!supabase) {
      setStatus("Missing Supabase environment variables.");
      setLoading(false);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const existingUser = session?.user ?? null;
    setUser(existingUser);
    await loadProfile(existingUser);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      const nextUser = newSession?.user ?? null;
      setUser(nextUser);
      if (event === 'TOKEN_REFRESHED') return;
      void loadProfile(nextUser);
    });

    setLoading(false);
    return () => subscription.unsubscribe();
  }, [supabase, loadProfile]);

  useEffect(() => {
    const savedTheme = (localStorage.getItem("theme-mode") as ThemeMode | null) ?? "system";
    setThemeMode(savedTheme);
    document.documentElement.dataset.theme = savedTheme;

    let cleanup: (() => void) | undefined;
    void init().then((unsub) => {
      cleanup = unsub;
    });
    return () => cleanup?.();
  }, [init]);

  function updateTheme(nextMode: ThemeMode) {
    setThemeMode(nextMode);
    localStorage.setItem("theme-mode", nextMode);
    document.documentElement.dataset.theme = nextMode;
  }

  function isAdmin() {
    return Boolean(profile?.is_superadmin || profile?.is_matrix_admin);
  }

  async function loginWithGoogle() {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) setStatus(error.message);
  }

  async function logout() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      setStatus(error.message);
      return;
    }
    setUser(null);
    setProfile(null);
    setStatus("Logged out.");
  }

  async function selectFlavor(flavorId: string, panel?: AdminPanel) {
    setSelectedFlavorId(flavorId);
    await loadSteps(flavorId);
    await loadRuns(flavorId);
    if (panel) setActivePanel(panel);
  }

  async function createFlavor(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !profile || !newFlavorSlug.trim()) return;

    setCreateFlavorNotice("");

    setCreateFlavorNotice("");

    setCreateFlavorNotice("");

    let { error } = await supabase.from("humor_flavors").insert({
      slug: newFlavorName.trim(),
      description: newFlavorDescription.trim() || null,
      created_by_user_id: profile.id,
      modified_by_user_id: profile.id,
    });

    if (
      error &&
      (isColumnMissingError(error.message, "slug") ||
        isColumnMissingError(error.message, "created_by_user_id") ||
        isColumnMissingError(error.message, "modified_by_user_id"))
    ) {
      const fallbackResult = await supabase.from("humor_flavors").insert({
        name: newFlavorName.trim(),
        description: newFlavorDescription.trim() || null,
        created_by: profile.id,
      });
      error = fallbackResult.error;
    }

    if (error) {
      setStatus(error.message);
      setCreateFlavorNotice(`❌ Create failed: ${error.message}`);
      return;
    }

    const createdFlavorName = newFlavorName.trim();
    setNewFlavorName("");
    setNewFlavorDescription("");
    setConfirmCreateFlavor(false);
    await loadFlavors();
    setStatus(`Flavor "${createdFlavorName}" created.`);
    setCreateFlavorNotice(`✅ Flavor "${createdFlavorName}" created successfully.`);
  }

  async function updateFlavor(flavor: HumorFlavor) {
    if (!supabase || !profile) return;

    const newSlug = prompt("New flavor slug", flavor.slug);
    if (!newSlug) return;

    let { error } = await supabase
      .from("humor_flavors")
      .update({
        slug: newSlug,
        modified_by_user_id: profile.id,
      })
      .eq("id", flavor.id);

    if (
      error &&
      (isColumnMissingError(error.message, "slug") ||
        isColumnMissingError(error.message, "modified_by_user_id"))
    ) {
      const fallbackResult = await supabase
        .from("humor_flavors")
        .update({
          name: newSlug,
        })
        .eq("id", flavor.id);
      error = fallbackResult.error;
    }

    if (error) {
      setStatus(error.message);
      return;
    }

    await loadFlavors();
  }

  async function deleteFlavor(flavor: HumorFlavor) {
    if (!supabase) return;
    if (!confirm(`Delete flavor "${flavor.slug}"?`)) return;

    const { error } = await supabase
      .from("humor_flavors")
      .delete()
      .eq("id", flavor.id);

    if (error) {
      setStatus(error.message);
      return;
    }

    setSelectedFlavorId("");
    setSteps([]);
    setRuns([]);
    await loadFlavors();
  }

  async function duplicateFlavor(flavor: HumorFlavor) {
    if (!supabase || !profile) return;

    const suggestedSlug = `${flavor.slug}-copy-${Date.now().toString().slice(-5)}`;
    const duplicateSlug = prompt("New slug for duplicated flavor", suggestedSlug)?.trim();
    if (!duplicateSlug) return;

    if (flavors.some((existingFlavor) => existingFlavor.slug === duplicateSlug)) {
      setStatus(`Slug "${duplicateSlug}" already exists. Choose a unique slug.`);
      return;
    }

    let { data: createdFlavor, error: createError } = await supabase
      .from("humor_flavors")
      .insert({
        slug: duplicateSlug,
        description: flavor.description,
        created_by_user_id: profile.id,
        modified_by_user_id: profile.id,
      })
      .select("id")
      .single();

    if (
      createError &&
      (isColumnMissingError(createError.message, "slug") ||
        isColumnMissingError(createError.message, "created_by_user_id") ||
        isColumnMissingError(createError.message, "modified_by_user_id"))
    ) {
      const fallbackResult = await supabase
        .from("humor_flavors")
        .insert({
          name: duplicateSlug,
          description: flavor.description,
          created_by: profile.id,
        })
        .select("id")
        .single();
      createdFlavor = fallbackResult.data;
      createError = fallbackResult.error;
    }

    if (createError || !createdFlavor) {
      setStatus(createError?.message ?? "Failed to duplicate flavor.");
      return;
    }

    let sourceStepsRaw: Record<string, unknown>[] = [];

    const { data: sourceStepsData, error: sourceStepsInitialError } = await supabase
      .from("humor_flavor_steps")
      .select("*")
      .eq("humor_flavor_id", flavor.id)
      .order("order_by", { ascending: true });

    sourceStepsRaw = (sourceStepsData ?? []) as Record<string, unknown>[];
    let sourceStepsError = sourceStepsInitialError;

    if (
      sourceStepsError &&
      (isColumnMissingError(sourceStepsError.message, "humor_flavor_id") ||
        isColumnMissingError(sourceStepsError.message, "order_by"))
    ) {
      const fallbackResult = await supabase
        .from("humor_flavor_steps")
        .select("*")
        .eq("flavor_id", flavor.id)
        .order("position", { ascending: true });
      sourceStepsError = fallbackResult.error;
      sourceStepsRaw = (fallbackResult.data ?? []) as Record<string, unknown>[];
    }

    if (sourceStepsError) {
      setStatus(`Flavor duplicated, but source steps could not be loaded: ${sourceStepsError.message}`);
      await loadFlavors();
      return;
    }

    const normalizedSourceSteps = sourceStepsRaw.map((step) => normalizeStepRow(step));

    if (sourceStepsRaw.length > 0) {
      const duplicatedSteps = sourceStepsRaw.map((step) => {
        const cloned = { ...step };
        delete cloned.id;
        delete cloned.created_datetime_utc;
        delete cloned.modified_datetime_utc;
        delete cloned.created_at;
        delete cloned.modified_at;

        if ("humor_flavor_id" in cloned || !("flavor_id" in cloned)) {
          cloned.humor_flavor_id = createdFlavor.id;
          delete cloned.flavor_id;
        } else {
          cloned.flavor_id = createdFlavor.id;
        }

        if ("created_by_user_id" in cloned) cloned.created_by_user_id = profile.id;
        if ("modified_by_user_id" in cloned) cloned.modified_by_user_id = profile.id;
        if ("created_by" in cloned) cloned.created_by = profile.id;

        return cloned;
      });

      const { error: duplicatedStepsError } = await supabase
        .from("humor_flavor_steps")
        .insert(duplicatedSteps);

      if (duplicatedStepsError) {
        setStatus(
          `Flavor "${duplicateSlug}" was created, but step duplication failed: ${duplicatedStepsError.message}`,
        );
        await loadFlavors();
        return;
      }
    }

    await loadFlavors();
    await selectFlavor(createdFlavor.id, "steps");
    setStatus(`Flavor "${duplicateSlug}" duplicated with ${normalizedSourceSteps.length} step(s).`);
  }

  async function createStep(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !profile || !selectedFlavorId || !stepTitle.trim() || !stepInstruction.trim()) {
      return;
    }

    const nextPos = steps.length ? Math.max(...steps.map((s) => s.position)) + 1 : 1;
    let { error } = await supabase.from("humor_flavor_steps").insert({
      humor_flavor_id: selectedFlavorId,
      order_by: nextPos,
      description: stepTitle.trim(),
      llm_user_prompt: stepInstruction.trim(),
      llm_system_prompt: stepInstruction.trim(),
      created_by_user_id: profile.id,
      modified_by_user_id: profile.id,
    });

    if (
      error &&
      (isColumnMissingError(error.message, "created_by_user_id") ||
        isColumnMissingError(error.message, "modified_by_user_id"))
    ) {
      const fallbackResult = await supabase.from("humor_flavor_steps").insert({
        humor_flavor_id: selectedFlavorId,
        order_by: nextPos,
        description: stepTitle.trim(),
        llm_user_prompt: stepInstruction.trim(),
        llm_system_prompt: stepInstruction.trim(),
      });
      error = fallbackResult.error;
    }

    if (
      error &&
      (isColumnMissingError(error.message, "humor_flavor_id") ||
        isColumnMissingError(error.message, "order_by") ||
        isColumnMissingError(error.message, "description"))
    ) {
      const fallbackResult = await supabase.from("humor_flavor_steps").insert({
        flavor_id: selectedFlavorId,
        position: nextPos,
        title: stepTitle.trim(),
        instruction: stepInstruction.trim(),
      });
      error = fallbackResult.error;
    }

    if (error) {
      setStatus(error.message);
      return;
    }

    setStepTitle("");
    setStepInstruction("");
    await loadSteps(selectedFlavorId);
  }

  async function updateStep(step: HumorFlavorStep) {
    if (!supabase || !profile) return;

    const title = prompt("Step title", step.title);
    if (!title) return;
    const instruction = prompt("Step instruction", step.instruction);
    if (!instruction) return;

    let { error } = await supabase
      .from("humor_flavor_steps")
      .update({
        description: title,
        llm_user_prompt: instruction,
        llm_system_prompt: instruction,
        modified_by_user_id: profile.id,
      })
      .eq("id", step.id);

    if (error && isColumnMissingError(error.message, "modified_by_user_id")) {
      const fallbackResult = await supabase
        .from("humor_flavor_steps")
        .update({
          description: title,
          llm_user_prompt: instruction,
          llm_system_prompt: instruction,
        })
        .eq("id", step.id);
      error = fallbackResult.error;
    }

    if (
      error &&
      (isColumnMissingError(error.message, "description") ||
        isColumnMissingError(error.message, "llm_user_prompt") ||
        isColumnMissingError(error.message, "llm_system_prompt"))
    ) {
      const fallbackResult = await supabase
        .from("humor_flavor_steps")
        .update({
          title,
          instruction,
        })
        .eq("id", step.id);
      error = fallbackResult.error;
    }

    if (error) {
      setStatus(error.message);
      return;
    }

    await loadSteps(step.flavor_id);
  }

  async function deleteStep(step: HumorFlavorStep) {
    if (!supabase) return;
    if (!confirm(`Delete step "${step.title}"?`)) return;

    const { error } = await supabase
      .from("humor_flavor_steps")
      .delete()
      .eq("id", step.id);

    if (error) {
      setStatus(error.message);
      return;
    }

    await loadSteps(step.flavor_id);
  }

  async function moveStep(step: HumorFlavorStep, direction: -1 | 1) {
    if (!supabase || !profile) return;

    const currentIndex = steps.findIndex((s) => s.id === step.id);
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= steps.length) return;

    const target = steps[targetIndex];
    const updates = [
      { id: step.id, position: target.position },
      { id: target.id, position: step.position },
    ];

    for (const update of updates) {
      let { error } = await supabase
        .from("humor_flavor_steps")
        .update({ order_by: update.position, modified_by_user_id: profile.id })
        .eq("id", update.id);

      if (error && isColumnMissingError(error.message, "modified_by_user_id")) {
        const fallbackResult = await supabase
          .from("humor_flavor_steps")
          .update({ order_by: update.position })
          .eq("id", update.id);
        error = fallbackResult.error;
      }
      if (error && isColumnMissingError(error.message, "order_by")) {
        const fallbackResult = await supabase
          .from("humor_flavor_steps")
          .update({ position: update.position, modified_by_user_id: profile.id })
          .eq("id", update.id);
        error = fallbackResult.error;
      }
      if (error) {
        setStatus(error.message);
        return;
      }
    }

    await loadSteps(String(step.humor_flavor_id));
  }

  async function testFlavor(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !profile || !selectedFlavor || isGenerating) return;

    const parseApiBody = async (res: Response) => {
      const text = await res.text();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    };

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;
    if (!token) {
      setStatus("You must be logged in to call the caption pipeline.");
      return;
    }

    const authHeaders = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    setIsGenerating(true);
    setGenerationProgress(5);
    setGenerationStage("Starting caption generation...");
    setStatus("Generate clicked. Running caption pipeline...");

    try {
      let resolvedImageUrl = imageUrl.trim();
      let resolvedImageId = "";

      if (selectedFile) {
        setGenerationProgress(15);
        setGenerationStage("Requesting presigned upload URL...");
        const presignedResponse = await fetch(
          `${API_BASE_URL}/pipeline/generate-presigned-url`,
          {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ contentType: selectedFile.type }),
          },
        );

        if (!presignedResponse.ok) {
          const body = await parseApiBody(presignedResponse);
          setStatus(`Step 1 failed: ${typeof body === "string" ? body : JSON.stringify(body)}`);
          return;
        }

        const presignedPayload = (await presignedResponse.json()) as {
          presignedUrl: string;
          cdnUrl: string;
        };

        setGenerationProgress(30);
        setGenerationStage("Uploading image...");
        const uploadResponse = await fetch(presignedPayload.presignedUrl, {
          method: "PUT",
          headers: { "Content-Type": selectedFile.type },
          body: selectedFile,
        });

        if (!uploadResponse.ok) {
          const body = await parseApiBody(uploadResponse);
          setStatus(`Step 2 failed: ${typeof body === "string" ? body : JSON.stringify(body)}`);
          return;
        }

        resolvedImageUrl = presignedPayload.cdnUrl;
        setImageUrl(presignedPayload.cdnUrl);
      }

      if (!resolvedImageUrl) {
        setStatus("Please upload an image or provide an image URL first.");
        return;
      }

      setGenerationProgress(45);
      setGenerationStage("Registering image...");
      const registerResponse = await fetch(`${API_BASE_URL}/pipeline/upload-image-from-url`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ imageUrl: resolvedImageUrl, isCommonUse: false }),
      });

      if (!registerResponse.ok) {
        const body = await parseApiBody(registerResponse);
        setStatus(`Step 3 failed: ${typeof body === "string" ? body : JSON.stringify(body)}`);
        return;
      }

      const registerPayload = (await registerResponse.json()) as { imageId: string };
      resolvedImageId = registerPayload.imageId;

      const generateBodies = [
        {
          imageId: resolvedImageId,
          humorFlavorId: selectedFlavor.id,
          humor_flavor_id: selectedFlavor.id,
          flavorId: selectedFlavor.id,
        },
        { imageId: resolvedImageId, humor_flavor_id: selectedFlavor.id },
      ];

      const targetCaptionCount = Math.min(20, Math.max(1, captionCount));
      const collectedPayloads: unknown[] = [];
      const collectedCaptions: string[] = [];
      let generationSucceeded = false;
      let lastGenerateError = "";

      setGenerationProgress(60);
      setGenerationStage("Generating captions...");
      const maxRounds = Math.min(6, targetCaptionCount);

      for (let round = 0; round < maxRounds && collectedCaptions.length < targetCaptionCount; round += 1) {
        for (const requestBody of generateBodies) {
          const captionsResponse = await fetch(`${API_BASE_URL}/pipeline/generate-captions`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              ...requestBody,
              captionCount: targetCaptionCount,
              numCaptions: targetCaptionCount,
              maxCaptions: targetCaptionCount,
            }),
          });

          if (captionsResponse.ok) {
            const roundPayload = (await captionsResponse.json()) as unknown;
            collectedPayloads.push(roundPayload);
            const foundCaptions = extractCaptions(roundPayload);
            for (const caption of foundCaptions) {
              if (!collectedCaptions.includes(caption)) {
                collectedCaptions.push(caption);
              }
              if (collectedCaptions.length >= targetCaptionCount) break;
            }
            generationSucceeded = true;
            break;
          }

          const body = await parseApiBody(captionsResponse);
          lastGenerateError = typeof body === "string" ? body : JSON.stringify(body);
        }
      }

      if (!generationSucceeded || collectedCaptions.length === 0) {
        setStatus(`Step 4 failed: ${lastGenerateError}`);
        return;
      }

      const payload: unknown = {
        requestedCaptionCount: targetCaptionCount,
        generatedCaptionCount: collectedCaptions.length,
        captions: collectedCaptions.slice(0, targetCaptionCount),
        attempts: collectedPayloads,
      };

      const clientRun: CaptionRun = {
        id: `local-${Date.now()}`,
        flavor_id: selectedFlavor.id,
        image_url: resolvedImageUrl,
        response_json: payload,
        created_by_user_id: profile.id,
        modified_by_user_id: profile.id,
        created_datetime_utc: new Date().toISOString(),
        modified_datetime_utc: new Date().toISOString(),
      };
      saveLocalRun(clientRun);
      setRuns((previous) => [clientRun, ...previous]);

      if (runsTableAvailable) {
        setGenerationProgress(85);
        setGenerationStage("Saving generated run...");
        let { error: insertError } = await supabase.from("humor_flavor_runs").insert({
          flavor_id: selectedFlavor.id,
          image_url: resolvedImageUrl,
          response_json: payload,
          created_by_user_id: profile.id,
          modified_by_user_id: profile.id,
        });

        if (
          insertError &&
          (isColumnMissingError(insertError.message, "created_by_user_id") ||
            isColumnMissingError(insertError.message, "modified_by_user_id"))
        ) {
          const fallbackResult = await supabase.from("humor_flavor_runs").insert({
            flavor_id: selectedFlavor.id,
            image_url: resolvedImageUrl,
            response_json: payload,
          });
          insertError = fallbackResult.error;
        }

        if (insertError?.message.includes("humor_flavor_runs")) {
          setRunsTableAvailable(false);
          setStatus(`Captions generated for image ${resolvedImageId}.`);
          setActivePanel("runs");
          return;
        }

        if (insertError) {
          setStatus(`Captions generated, but saving run failed: ${insertError.message}`);
          return;
        }

        await loadRuns(selectedFlavor.id);
      }

      setGenerationProgress(100);
      setGenerationStage("Done");
      setStatus(`Captions generated for image ${resolvedImageId}.`);
      setActivePanel("runs");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleImageUpload(file: File | null) {
    if (!file) {
      setSelectedFile(null);
      setImageUploadName("");
      return;
    }

    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      setStatus(
        "Unsupported file type. Use image/jpeg, image/jpg, image/png, image/webp, image/gif, or image/heic.",
      );
      setSelectedFile(null);
      setImageUploadName("");
      return;
    }

    setStatus("");
    setSelectedFile(file);
    setImageUploadName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setImageUrl(result);
    };
    reader.readAsDataURL(file);
  }

  if (loading) {
    return <main className="container">Loading...</main>;
  }

  if (!supabase) {
    return (
      <main className="container">
        <h1>Humor Flavor Prompt Chain</h1>
        <p>Missing required environment variables.</p>
        <ul>
          <li>
            <code>NEXT_PUBLIC_SUPABASE_URL</code>
          </li>
          <li>
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
          </li>
        </ul>
        <p className="small">
          Add these in Vercel Project Settings → Environment Variables, then redeploy.
        </p>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="row card top-theme-toggle">
        <strong>Theme</strong>
        <button type="button" onClick={() => updateTheme("light")} disabled={themeMode === "light"}>
          Light
        </button>
        <button type="button" onClick={() => updateTheme("dark")} disabled={themeMode === "dark"}>
          Dark
        </button>
        <button type="button" onClick={() => updateTheme("system")} disabled={themeMode === "system"}>
          System
        </button>
      </div>

      <h1>Humor Flavor Prompt Chain</h1>
      <p className="small">{status}</p>

      <div className="row card">
        <strong>{user ? `Logged in: ${user.email ?? user.id}` : "Not logged in"}</strong>
        {!user ? (
          <button type="button" onClick={loginWithGoogle}>
            Login with Google
          </button>
        ) : (
          <button type="button" onClick={logout}>
            Log out
          </button>
        )}
      </div>

      {!user && <p>Please sign in with Google to continue.</p>}

      {user && !isAdmin() && (
        <p>
          Logged in successfully, but this account is not admin in <code>profiles</code>. Ensure the
          profile row for your auth user has <code>is_superadmin=true</code> or <code>is_matrix_admin=true</code>.
        </p>
      )}

      {isAdmin() && (
        <div className="admin-layout">
          <div>
            {activePanel === "create-flavor" && (
              <section className="card" id="create-flavor">
                <h2>✨ Create humor flavor</h2>
                <form className="grid" onSubmit={createFlavor}>
                  <input
                    value={newFlavorName}
                    onChange={(e) => setNewFlavorName(e.target.value)}
                    placeholder="Flavor slug"
                    required
                  />
                  <textarea
                    value={newFlavorDescription}
                    onChange={(e) => setNewFlavorDescription(e.target.value)}
                    placeholder="Description"
                  />
                  <label className="row">
                    <input
                      type="checkbox"
                      checked={confirmCreateFlavor}
                      onChange={(e) => setConfirmCreateFlavor(e.target.checked)}
                    />
                    <span>Confirm I want to create this flavor</span>
                  </label>
                  <button type="submit" disabled={!confirmCreateFlavor}>
                    ✅ Confirm create flavor
                  </button>
                </form>
                {createFlavorNotice && <p className="small">{createFlavorNotice}</p>}
              </section>
            )}

            {activePanel === "flavors" && (
              <section className="card" id="flavors">
                <h2>🧠 Humor flavors</h2>
                <input
                  value={flavorSearch}
                  onChange={(e) => setFlavorSearch(e.target.value)}
                  placeholder="Search flavors by slug or description"
                />
                <div className="grid">
                  {filteredFlavors.map((flavor) => (
                    <div key={flavor.id} className="card">
                      <div className="row">
                        <button type="button" onClick={() => void selectFlavor(flavor.id, "steps")}>
                          {selectedFlavorId === flavor.id ? "Selected" : "Select"}
                        </button>
                        <strong>{flavor.slug}</strong>
                      </div>
                      <p>{flavor.description}</p>
                      <div className="row">
                        <button type="button" onClick={() => void selectFlavor(flavor.id, "steps")}>
                          🪜 Edit steps
                        </button>
                        <button type="button" onClick={() => updateFlavor(flavor)}>
                          Rename
                        </button>
                        <button type="button" onClick={() => duplicateFlavor(flavor)}>
                          Duplicate
                        </button>
                        <button type="button" onClick={() => deleteFlavor(flavor)}>
                          Delete
                        </button>
                        <button type="button" onClick={() => void selectFlavor(flavor.id, "test")}>
                          🧪 Make captions
                        </button>
                      </div>
                    </div>
                  ))}
                  {filteredFlavors.length === 0 && (
                    <p className="small">No flavors matched your search.</p>
                  )}
                </div>
              </section>
            )}

            {activePanel === "steps" && (
              <section className="card" id="steps">
                <h2>🪜 Steps {selectedFlavor ? `for ${selectedFlavor.slug}` : ""}</h2>
                {selectedFlavor ? (
                  <>
                    <form className="grid" onSubmit={createStep}>
                      <input
                        value={stepTitle}
                        onChange={(e) => setStepTitle(e.target.value)}
                        placeholder="Step title"
                        required
                      />
                      <textarea
                        value={stepInstruction}
                        onChange={(e) => setStepInstruction(e.target.value)}
                        placeholder="Step instruction"
                        required
                      />
                      <button type="submit">Add step</button>
                    </form>
                    <div className="grid">
                      {steps.map((step) => (
                        <div key={step.id} className="card">
                          <div className="row">
                            <strong>
                              #{step.position} - {step.title}
                            </strong>
                          </div>
                          <p>{step.instruction}</p>
                          <p className="small">
                            <strong>LLM system prompt:</strong> {step.llm_system_prompt || "—"}
                          </p>
                          <p className="small">
                            <strong>LLM user prompt:</strong> {step.llm_user_prompt || "—"}
                          </p>
                          <div className="row">
                            <button type="button" onClick={() => moveStep(step, -1)}>
                              Move up
                            </button>
                            <button type="button" onClick={() => moveStep(step, 1)}>
                              Move down
                            </button>
                            <button type="button" onClick={() => updateStep(step)}>
                              Edit
                            </button>
                            <button type="button" onClick={() => deleteStep(step)}>
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p>Select a flavor first.</p>
                )}
              </section>
            )}

            {activePanel === "test" && (
              <section className="card" id="test">
                <h2>🧪 Test flavor via API</h2>
                <p className="small">
                  Ready checks: flavor {selectedFlavorId ? "✅" : "❌"} · image {hasImageInput ? "✅" : "❌"}
                </p>
                <p className="small">Status: {status || "Idle"}</p>
                {isGenerating && (
                  <div className="generation-progress">
                    <p className="small">
                      {generationStage} ({generationProgress}%)
                    </p>
                    <progress value={generationProgress} max={100} />
                  </div>
                )}
                <form className="grid" onSubmit={testFlavor}>
                  <label className="row">
                    <span>Number of captions:</span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={captionCount}
                      onChange={(e) => setCaptionCount(Number(e.target.value) || 1)}
                    />
                  </label>
                  <label className="row">
                    <span>Upload image:</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  {imageUploadName && <p className="small">Using uploaded image: {imageUploadName}</p>}
                  <input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="Image URL from your test set (or upload a file above)"
                    required
                  />
                  {imageUrl && (
                    <Image
                      src={imageUrl}
                      alt="Test input preview"
                      width={280}
                      height={180}
                      unoptimized
                      style={{
                        borderRadius: 8,
                        objectFit: "cover",
                        width: "280px",
                        height: "180px",
                      }}
                    />
                  )}
                  <button type="submit" disabled={!canGenerate}>
                    {isGenerating ? "Generating captions..." : "Generate captions"}
                  </button>
                </form>
              </section>
            )}

            {activePanel === "runs" && (
              <section className="card" id="runs">
                <h2>📜 Recent generated captions</h2>
                <div className="grid">
                  {runs.map((run) => {
                    const captions = extractCaptions(run.response_json);

                    return (
                      <div key={run.id} className="card">
                        <p className="small">{formatTimestamp(run.created_datetime_utc)}</p>
                        <p>
                          <strong>Image:</strong> {run.image_url}
                        </p>
                        {captions.length > 0 ? (
                          <ol>
                            {captions.map((caption, index) => (
                              <li key={`${run.id}-caption-${index}`}>{caption}</li>
                            ))}
                          </ol>
                        ) : (
                          <p className="small">No parsed captions available for this run.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          <aside className="card steps-key">
            <h3>📂 Sections</h3>
            <div className="tabs-list">
              <button type="button" onClick={() => setActivePanel("create-flavor")} title="Create humor flavor">
                ✨ Create
              </button>
              <button type="button" onClick={() => setActivePanel("flavors")} title="View/update/delete flavors">
                🧠 Flavors
              </button>
              <button type="button" onClick={() => setActivePanel("steps")} title="Manage flavor steps">
                🪜 Steps
              </button>
              <button type="button" onClick={() => setActivePanel("test")} title="Generate captions">
                🧪 Test
              </button>
              <button type="button" onClick={() => setActivePanel("runs")} title="Generated caption history">
                📜 Runs
              </button>
            </div>
            <h3>🗺️ Steps key</h3>
            <ol>
              <li>
                <strong>Create:</strong> Create a flavor!
              </li>
              <li>
                <strong>Flavors:</strong> Find your new flavor!
              </li>
              <li>
                <strong>Steps:</strong> Create some instructions. What theme do you want your captions
                to be? The AI will follow those instructions to create your perfect captions.
              </li>
              <li>
                <strong>Test:</strong> Test it out!
              </li>
              <li>
                <strong>Runs:</strong> Check out your recently generated captions!
              </li>
            </ol>
          </aside>
        </div>
      )}
    </main>
  );
}
