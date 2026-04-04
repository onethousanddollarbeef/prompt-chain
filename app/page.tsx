'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient, getSupabaseEnvInfo } from '@/lib/supabase';
import type { HumorFlavor, HumorFlavorStep, Profile } from '@/lib/types';

type ThemeMode = 'light' | 'dark' | 'system';

export default function Page() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<ThemeMode>('system');

  const [flavors, setFlavors] = useState<HumorFlavor[]>([]);
  const [selectedFlavorId, setSelectedFlavorId] = useState<string>('');
  const [steps, setSteps] = useState<HumorFlavorStep[]>([]);

  const [newFlavorSlug, setNewFlavorSlug] = useState('');
  const [newFlavorDescription, setNewFlavorDescription] = useState('');
  const [flavorSearch, setFlavorSearch] = useState('');

  const [stepTitle, setStepTitle] = useState('');
  const [stepInstruction, setStepInstruction] = useState('');

  const [imageUrl, setImageUrl] = useState('');
  const [imageInputMode, setImageInputMode] = useState<'url' | 'file'>('url');
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState<string>('');
  const [apiResult, setApiResult] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const selectedFlavorIdRef = useRef<string>('');

  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const envInfo = useMemo(() => getSupabaseEnvInfo(), []);

  const selectedFlavor = useMemo(
    () => flavors.find((flavor) => flavor.id === selectedFlavorId) ?? null,
    [flavors, selectedFlavorId]
  );

  const filteredFlavors = useMemo(() => {
    const query = flavorSearch.trim().toLowerCase();
    if (!query) return flavors;
    return flavors.filter((flavor) => {
      const slug = flavor.slug?.toLowerCase() ?? '';
      const description = flavor.description?.toLowerCase() ?? '';
      return slug.includes(query) || description.includes(query);
    });
  }, [flavorSearch, flavors]);

  useEffect(() => {
    selectedFlavorIdRef.current = selectedFlavorId;
  }, [selectedFlavorId]);

  const loadSteps = useCallback(
    async (flavorId: string) => {
      if (!supabase) return;

      const { data, error } = await supabase
        .from('humor_flavor_steps')
        .select('*')
        .eq('humor_flavor_id', flavorId)
        .order('order_by', { ascending: true });
      if (error) {
        setStatus(error.message);
        return;
      }
      setSteps(data ?? []);
    },
    [supabase]
  );

  const loadFlavors = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from('humor_flavors')
      .select('*')
      .order('created_datetime_utc', { ascending: false });
    if (error) {
      setStatus(error.message);
      return;
    }
    setFlavors(data ?? []);

    const currentSelectedFlavorId = selectedFlavorIdRef.current;
    const selectedStillExists = data?.some((flavor) => flavor.id === currentSelectedFlavorId);
    const nextFlavorId =
      (selectedStillExists ? currentSelectedFlavorId : null) ?? data?.[0]?.id ?? '';

    if (nextFlavorId) {
      if (nextFlavorId !== selectedFlavorIdRef.current) {
        setSelectedFlavorId(nextFlavorId);
      }
      await loadSteps(nextFlavorId);
    }
  }, [loadSteps, supabase]);

  const loadProfile = useCallback(
    async (currentUser: User | null) => {
      if (!supabase || !currentUser) {
        setProfile(null);
        setFlavors([]);
        setSteps([]);
        setSelectedFlavorId('');
        return;
      }

      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('id, is_superadmin, is_matrix_admin')
        .eq('id', currentUser.id)
        .single();

      if (error) {
        setProfile(null);
        setStatus(`Profile lookup failed: ${error.message}`);
        return;
      }

      setProfile(profileData);
      if (profileData.is_superadmin || profileData.is_matrix_admin) {
        setStatus('Authenticated as admin.');
        await loadFlavors();
      } else {
        setStatus('Logged in, but account is not admin in profiles table.');
        setFlavors([]);
        setSteps([]);
        setSelectedFlavorId('');
      }
    },
    [loadFlavors, supabase]
  );

  const init = useCallback(async () => {
    setLoading(true);

    if (!supabase) {
      setStatus('Missing Supabase environment variables.');
      setLoading(false);
      return;
    }

    const {
      data: { session }
    } = await supabase.auth.getSession();

    const existingUser = session?.user ?? null;
    setUser(existingUser);
    await loadProfile(existingUser);

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      const nextUser = newSession?.user ?? null;
      setUser(nextUser);
      if (event === 'TOKEN_REFRESHED') return;
      void loadProfile(nextUser);
    });

    setLoading(false);
    return () => subscription.unsubscribe();
  }, [loadProfile, supabase]);

  useEffect(() => {
    const savedTheme = (localStorage.getItem('theme-mode') as ThemeMode | null) ?? 'system';
    setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme;
    let cleanup: (() => void) | undefined;
    void init().then((unsub) => {
      cleanup = unsub;
    });
    return () => cleanup?.();
  }, [init]);

  function isAdmin() {
    return Boolean(profile?.is_superadmin || profile?.is_matrix_admin);
  }

  function setThemeMode(mode: ThemeMode) {
    setTheme(mode);
    localStorage.setItem('theme-mode', mode);
    document.documentElement.dataset.theme = mode;
  }

  async function loginWithGoogle() {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) {
      setStatus(error.message);
    }
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
    setStatus('Logged out.');
  }


  async function quickGenerateCaptions(e: FormEvent) {
    e.preventDefault();
    if (!imageUrl.trim()) {
      setStatus('Please provide an image URL.');
      return;
    }

    const res = await fetch('/api/generate-captions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flavor: {
          id: 'quick-start-flavor',
          name: 'Quick Start Flavor',
          description: 'Fallback local mode without Supabase'
        },
        steps: [
          {
            position: 1,
            title: 'Describe image',
            instruction: 'Describe what is in the image in plain text.'
          },
          {
            position: 2,
            title: 'Find humor angle',
            instruction: 'Take the description and make a funny observation.'
          },
          {
            position: 3,
            title: 'Generate captions',
            instruction: 'Produce five short funny captions.'
          }
        ],
        imageUrl: imageUrl.trim()
      })
    });

    const payload = (await res.json()) as { error?: string; data?: unknown };
    if (!res.ok) {
      setStatus(payload.error ?? 'Generation failed');
      return;
    }

    setApiResult(JSON.stringify(payload.data, null, 2));
    setStatus('Quick caption generation complete.');
  }

  async function createFlavor(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !profile || !newFlavorSlug.trim()) return;

    const { error } = await supabase.from('humor_flavors').insert({
      slug: newFlavorSlug.trim(),
      description: newFlavorDescription.trim() || null,
      created_by_user_id: profile.id,
      modified_by_user_id: profile.id
    });

    if (error) {
      setStatus(error.message);
      return;
    }

    setNewFlavorSlug('');
    setNewFlavorDescription('');
    await loadFlavors();
    setStatus('Flavor created.');
  }

  async function updateFlavor(flavor: HumorFlavor) {
    if (!supabase) return;

    const newSlug = prompt('New flavor slug', flavor.slug);
    if (!newSlug) return;

    const { error } = await supabase
      .from('humor_flavors')
      .update({
        slug: newSlug,
        modified_by_user_id: profile?.id ?? null,
        modified_datetime_utc: new Date().toISOString()
      })
      .eq('id', flavor.id);

    if (error) {
      setStatus(error.message);
      return;
    }
    await loadFlavors();
  }

  async function deleteFlavor(flavor: HumorFlavor) {
    if (!supabase) return;

    if (!confirm(`Delete flavor "${flavor.slug}"?`)) return;
    const { error } = await supabase.from('humor_flavors').delete().eq('id', flavor.id);
    if (error) {
      setStatus(error.message);
      return;
    }
    setSelectedFlavorId('');
    setSteps([]);
    await loadFlavors();
  }

  async function createStep(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !selectedFlavorId || !stepTitle.trim() || !stepInstruction.trim()) return;

    const template = steps[steps.length - 1];
    const nextOrder = steps.length ? Math.max(...steps.map((s) => s.order_by)) + 1 : 1;
    const { error } = await supabase.from('humor_flavor_steps').insert({
      humor_flavor_id: Number(selectedFlavorId),
      order_by: nextOrder,
      description: stepTitle.trim(),
      llm_user_prompt: stepInstruction.trim(),
      llm_system_prompt: template?.llm_system_prompt ?? 'You are a humor assistant.',
      llm_temperature: template?.llm_temperature ?? 0.7,
      llm_input_type_id: template?.llm_input_type_id ?? 1,
      llm_output_type_id: template?.llm_output_type_id ?? 1,
      llm_model_id: template?.llm_model_id ?? 14,
      humor_flavor_step_type_id: template?.humor_flavor_step_type_id ?? 1,
      created_by_user_id: profile?.id ?? null,
      modified_by_user_id: profile?.id ?? null
    });
    if (error) {
      setStatus(error.message);
      return;
    }

    setStepTitle('');
    setStepInstruction('');
    await loadSteps(selectedFlavorId);
  }

  async function updateStep(step: HumorFlavorStep) {
    if (!supabase) return;

    const title = prompt('Step title', step.description ?? '');
    if (!title) return;
    const instruction = prompt('Step instruction', step.llm_user_prompt ?? '');
    if (!instruction) return;

    const { error } = await supabase
      .from('humor_flavor_steps')
      .update({
        description: title,
        llm_user_prompt: instruction,
        modified_by_user_id: profile?.id ?? null,
        modified_datetime_utc: new Date().toISOString()
      })
      .eq('id', step.id);

    if (error) {
      setStatus(error.message);
      return;
    }
    await loadSteps(String(step.humor_flavor_id));
  }

  async function deleteStep(step: HumorFlavorStep) {
    if (!supabase) return;

    if (!confirm(`Delete step "${step.description ?? `Step ${step.order_by}`}"?`)) return;

    const { error } = await supabase.from('humor_flavor_steps').delete().eq('id', step.id);
    if (error) {
      setStatus(error.message);
      return;
    }
    await loadSteps(String(step.humor_flavor_id));
  }

  async function moveStep(step: HumorFlavorStep, direction: -1 | 1) {
    if (!supabase) return;

    const currentIndex = steps.findIndex((s) => s.id === step.id);
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= steps.length) return;

    const target = steps[targetIndex];
    const updates = [
      { id: step.id, order_by: target.order_by },
      { id: target.id, order_by: step.order_by }
    ];

    for (const update of updates) {
      const { error } = await supabase
        .from('humor_flavor_steps')
        .update({ order_by: update.order_by })
        .eq('id', update.id);
      if (error) {
        setStatus(error.message);
        return;
      }
    }

    await loadSteps(String(step.humor_flavor_id));
  }

  async function testFlavor(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !selectedFlavor) return;

    const normalizedImageInput =
      imageInputMode === 'url' ? imageUrl.trim() : uploadedImageDataUrl.trim();

    if (!normalizedImageInput) {
      setStatus(
        imageInputMode === 'url'
          ? 'Please provide a direct image URL.'
          : 'Please upload an image file from your computer.'
      );
      return;
    }

    if (imageInputMode === 'url') {
      try {
        const parsed = new URL(normalizedImageInput);
        const isLikelyDirectImage = /\.(png|jpe?g|webp|gif|bmp|heic|avif)$/i.test(parsed.pathname);
        if (!isLikelyDirectImage) {
          setStatus(
            'That looks like a webpage URL, not a direct image file URL. Use a direct image link or upload a file.'
          );
          return;
        }
      } catch {
        setStatus('Invalid URL format. Please paste a valid direct image URL.');
        return;
      }
    }

    const {
      data: { session }
    } = await supabase.auth.getSession();

    const res = await fetch('/api/generate-captions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
      },
      body: JSON.stringify({
        flavor: selectedFlavor,
        steps: steps.map((step) => ({
          position: step.order_by,
          title: step.description ?? `Step ${step.order_by}`,
          instruction: step.llm_user_prompt ?? ''
        })),
        imageUrl: normalizedImageInput
      })
    });

    const payload = (await res.json()) as {
      error?: string;
      details?: unknown;
      attempted_urls?: string[];
      data?: unknown;
    };
    if (!res.ok) {
      const detailMessage = (() => {
        if (typeof payload.details === 'string') {
          if (payload.details.includes('<!DOCTYPE html') || payload.details.includes('<html')) {
            return 'Upstream returned HTML/404. The API base URL is likely right, but the path may require /api prefix.';
          }
          return payload.details.slice(0, 300);
        }
        return JSON.stringify(payload.details ?? {}).slice(0, 300);
      })();
      const attemptedUrlsMessage =
        payload.attempted_urls && payload.attempted_urls.length > 0
          ? ` Attempted URLs: ${payload.attempted_urls.join(', ')}`
          : '';
      setStatus(
        `${payload.error ?? 'Generation failed'}${detailMessage ? `: ${detailMessage}` : ''}${attemptedUrlsMessage}`
      );
      return;
    }

    setApiResult(JSON.stringify(payload.data, null, 2));
    setStatus('Captions generated via REST API.');
  }

  async function onImageFileSelected(file: File | null) {
    if (!file) {
      setUploadedImageDataUrl('');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        setUploadedImageDataUrl(result);
      }
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
        <p>Missing Supabase environment variables.</p>
        <p className="small">
          NEXT_PUBLIC_SUPABASE_URL set: {String(envInfo.hasSupabaseUrl)} |
          NEXT_PUBLIC_SUPABASE_ANON_KEY set: {String(envInfo.hasSupabaseAnonKey)}
        </p>
        <p className="small">Supabase host: {envInfo.supabaseUrlHost || '(not set)'}</p>
        <section className="card">
          <h2>Quick test mode (no Supabase)</h2>
          <p className="small">
            You can still iterate like Assignment 5 by testing caption generation directly with an image URL.
          </p>
          <form className="grid" onSubmit={quickGenerateCaptions}>
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Image URL"
              required
            />
            <button type="submit">Generate captions (quick mode)</button>
          </form>
          {status && <p className="small">{status}</p>}
          {apiResult && <pre>{apiResult}</pre>}
        </section>
      </main>
    );
  }

  return (
    <main className="container">
      <h1>Humor Flavor Prompt Chain</h1>
      <p className="small">{status}</p>
      <p className="small">Supabase host: {envInfo.supabaseUrlHost || '(not set)'}</p>
      <div className="row card">
        <strong>{user ? `Logged in: ${user.email ?? user.id}` : 'Not logged in'}</strong>
        {!user ? (
          <button onClick={loginWithGoogle}>Login with Google</button>
        ) : (
          <button onClick={logout}>Log out</button>
        )}
      </div>

      {user && profile && (
        <p className="small">
          Admin flags: superadmin={String(profile.is_superadmin)} matrix_admin={String(profile.is_matrix_admin)}
        </p>
      )}

      {!user && <p>Please sign in with Google to continue.</p>}

      {user && !isAdmin() && (
        <p>
          Logged in successfully, but this account is not admin in <code>profiles</code>. Ensure the profile row
          for your auth user has <code>is_superadmin=true</code> or <code>is_matrix_admin=true</code>.
        </p>
      )}

      {isAdmin() && (
        <div className="split-layout">
          <div className="split-column">
            <section className="card">
            <h2>Theme</h2>
            <div className="row">
              <button onClick={() => setThemeMode('light')} disabled={theme === 'light'}>
                Light
              </button>
              <button onClick={() => setThemeMode('dark')} disabled={theme === 'dark'}>
                Dark
              </button>
              <button onClick={() => setThemeMode('system')} disabled={theme === 'system'}>
                System
              </button>
            </div>
            </section>

            <section className="card">
            <h2>Create humor flavor</h2>
            <p className="small">Saved to <code>humor_flavors</code> table.</p>
            <form className="grid" onSubmit={createFlavor}>
              <input
                value={newFlavorSlug}
                onChange={(e) => setNewFlavorSlug(e.target.value)}
                placeholder="Flavor slug"
                required
              />
              <textarea
                value={newFlavorDescription}
                onChange={(e) => setNewFlavorDescription(e.target.value)}
                placeholder="Description"
              />
              <button type="submit">Create flavor</button>
            </form>
            </section>

            <section className="card">
            <h2>Humor flavors</h2>
            <input
              value={flavorSearch}
              onChange={(e) => setFlavorSearch(e.target.value)}
              placeholder="Search flavor slug/description"
            />
            <div className="grid scroll-area">
              {filteredFlavors.map((flavor) => (
                <div key={flavor.id} className="card">
                  <div className="row">
                    <button
                      onClick={async () => {
                        setSelectedFlavorId(flavor.id);
                        await loadSteps(flavor.id);
                      }}
                    >
                      {selectedFlavorId === flavor.id ? 'Selected' : 'Select'}
                    </button>
                    <strong>{flavor.slug}</strong>
                  </div>
                  <p>{flavor.description}</p>
                  <div className="row">
                    <button onClick={() => updateFlavor(flavor)}>Rename</button>
                    <button onClick={() => deleteFlavor(flavor)}>Delete</button>
                  </div>
                </div>
              ))}
              {filteredFlavors.length === 0 && <p className="small">No flavors match your search.</p>}
            </div>
            </section>
          </div>

          <div className="split-column">
            <section className="card">
            <h2>Steps {selectedFlavor ? `for ${selectedFlavor.slug}` : ''}</h2>
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
                <div className="grid scroll-area">
                  {steps.map((step) => (
                    <div key={step.id} className="card">
                      <div className="row">
                        <strong>
                          #{step.order_by} - {step.description ?? `Step ${step.order_by}`}
                        </strong>
                      </div>
                      <p>{step.llm_user_prompt}</p>
                      <div className="row">
                        <button onClick={() => moveStep(step, -1)}>Move up</button>
                        <button onClick={() => moveStep(step, 1)}>Move down</button>
                        <button onClick={() => updateStep(step)}>Edit</button>
                        <button onClick={() => deleteStep(step)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p>Select a flavor first.</p>
            )}
            </section>

            <section className="card">
            <h2>Test flavor via API</h2>
            <p className="small">Captions are generated and stored by the REST API (not in Supabase).</p>
            <div className="row">
              <button
                type="button"
                onClick={() => setImageInputMode('url')}
                disabled={imageInputMode === 'url'}
              >
                Use URL
              </button>
              <button
                type="button"
                onClick={() => setImageInputMode('file')}
                disabled={imageInputMode === 'file'}
              >
                Upload file
              </button>
            </div>
            <form className="grid" onSubmit={testFlavor}>
              {imageInputMode === 'url' ? (
                <input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Direct image URL (ending in .jpg/.png/etc)"
                  required
                />
              ) : (
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => void onImageFileSelected(e.target.files?.[0] ?? null)}
                  required
                />
              )}
              <button type="submit" disabled={!selectedFlavorId || steps.length === 0}>
                Generate captions
              </button>
            </form>
            {apiResult && <pre>{apiResult}</pre>}
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
