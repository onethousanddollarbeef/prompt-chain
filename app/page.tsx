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

  const [stepTitle, setStepTitle] = useState("");
  const [stepInstruction, setStepInstruction] = useState("");

  const [imageUrl, setImageUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageUploadName, setImageUploadName] = useState("");
  const [status, setStatus] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);

  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const selectedFlavor = useMemo(
    () => flavors.find((flavor) => flavor.id === selectedFlavorId) ?? null,
    [flavors, selectedFlavorId],
  );

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
      slug: String(row.slug ?? "(missing-slug)"),
      description: typeof row.description === "string" ? row.description : null,
      created_by_user_id: String(row.created_by_user_id ?? row.created_by ?? ""),
      modified_by_user_id: String(row.modified_by_user_id ?? row.modified_by ?? ""),
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

  const loadSteps = useCallback(
    async (flavorId: string) => {
      if (!supabase) return;

      const { data, error } = await supabase
        .from("humor_flavor_steps")
        .select("*")
        .eq("flavor_id", flavorId)
        .order("position", { ascending: true });

      if (error) {
        setStatus(error.message);
        return;
      }

      setSteps(data ?? []);
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
        if (error.message.includes("humor_flavor_runs")) {
          setRunsTableAvailable(false);
          setRuns([]);
          return;
        }
        setStatus(error.message);
        return;
      }

      setRuns(data ?? []);
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
    if (!supabase || !profile || !newFlavorName.trim()) return;

    setCreateFlavorNotice("");

    const { error } = await supabase.from("humor_flavors").insert({
      slug: newFlavorName.trim(),
      description: newFlavorDescription.trim() || null,
      created_by_user_id: profile.id,
      modified_by_user_id: profile.id,
    });

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

    const { error } = await supabase
      .from("humor_flavors")
      .update({
        slug: newSlug,
        modified_by_user_id: profile.id,
      })
      .eq("id", flavor.id);

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

    const { data: createdFlavor, error: createError } = await supabase
      .from("humor_flavors")
      .insert({
        slug: duplicateSlug,
        description: flavor.description,
        created_by_user_id: profile.id,
        modified_by_user_id: profile.id,
      })
      .select("id")
      .single();

    if (createError || !createdFlavor) {
      setStatus(createError?.message ?? "Failed to duplicate flavor.");
      return;
    }

    const { data: sourceSteps, error: sourceStepsError } = await supabase
      .from("humor_flavor_steps")
      .select("position, title, instruction")
      .eq("flavor_id", flavor.id)
      .order("position", { ascending: true });

    if (sourceStepsError) {
      setStatus(`Flavor duplicated, but source steps could not be loaded: ${sourceStepsError.message}`);
      await loadFlavors();
      return;
    }

    if ((sourceSteps ?? []).length > 0) {
      const duplicatedSteps = (sourceSteps ?? []).map((step) => ({
        flavor_id: createdFlavor.id,
        position: step.position,
        title: step.title,
        instruction: step.instruction,
        created_by_user_id: profile.id,
        modified_by_user_id: profile.id,
      }));

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
    setStatus(`Flavor "${duplicateSlug}" duplicated with ${sourceSteps?.length ?? 0} step(s).`);
  }

  async function createStep(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !profile || !selectedFlavorId || !stepTitle.trim() || !stepInstruction.trim()) {
      return;
    }

    const nextPos = steps.length ? Math.max(...steps.map((s) => s.position)) + 1 : 1;
    const { error } = await supabase.from("humor_flavor_steps").insert({
      flavor_id: selectedFlavorId,
      position: nextPos,
      title: stepTitle.trim(),
      instruction: stepInstruction.trim(),
      created_by_user_id: profile.id,
      modified_by_user_id: profile.id,
    });

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

    const { error } = await supabase
      .from("humor_flavor_steps")
      .update({ title, instruction, modified_by_user_id: profile.id })
      .eq("id", step.id);

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
      const { error } = await supabase
        .from("humor_flavor_steps")
        .update({ position: update.position, modified_by_user_id: profile.id })
        .eq("id", update.id);
      if (error) {
        setStatus(error.message);
        return;
      }
    }

    await loadSteps(step.flavor_id);
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
    setStatus("Generate clicked. Running caption pipeline...");

    try {
      let resolvedImageUrl = imageUrl.trim();
      let resolvedImageId = "";

      if (selectedFile) {
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
        { imageId: resolvedImageId, humorFlavorId: selectedFlavor.id },
        { imageId: resolvedImageId, humor_flavor_id: selectedFlavor.id },
        { imageId: resolvedImageId },
      ];

      let payload: unknown = null;
      let generationSucceeded = false;
      let lastGenerateError = "";

      for (const requestBody of generateBodies) {
        const captionsResponse = await fetch(`${API_BASE_URL}/pipeline/generate-captions`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(requestBody),
        });

        if (captionsResponse.ok) {
          payload = (await captionsResponse.json()) as unknown;
          generationSucceeded = true;
          break;
        }

        const body = await parseApiBody(captionsResponse);
        lastGenerateError = typeof body === "string" ? body : JSON.stringify(body);
      }

      if (!generationSucceeded) {
        setStatus(`Step 4 failed: ${lastGenerateError}`);
        return;
      }

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
      setRuns((previous) => [clientRun, ...previous]);

      if (runsTableAvailable) {
        const { error: insertError } = await supabase.from("humor_flavor_runs").insert({
          flavor_id: selectedFlavor.id,
          image_url: resolvedImageUrl,
          response_json: payload,
          created_by_user_id: profile.id,
          modified_by_user_id: profile.id,
        });

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

      {user && profile && (
        <p className="small">
          Admin flags: superadmin={String(profile.is_superadmin)} matrix_admin=
          {String(profile.is_matrix_admin)}
        </p>
      )}

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
                <div className="grid">
                  {flavors.map((flavor) => (
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
                <form className="grid" onSubmit={testFlavor}>
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
                        <p className="small">{new Date(run.created_datetime_utc).toLocaleString()}</p>
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
              <li>Take in an image and output a description in text.</li>
              <li>Take output from step 1 and output something funny about it.</li>
              <li>Take output from step 2 and output five short, funny captions.</li>
            </ol>
          </aside>
        </div>
      )}
    </main>
  );
}
