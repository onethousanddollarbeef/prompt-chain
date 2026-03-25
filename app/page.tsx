'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import type { CaptionRun, HumorFlavor, HumorFlavorStep, Profile } from '@/lib/types';

type ThemeMode = 'light' | 'dark' | 'system';
type AdminPanel = 'theme' | 'create-flavor' | 'flavors' | 'steps' | 'test' | 'runs';

export default function Page() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<ThemeMode>('system');
  const [activePanel, setActivePanel] = useState<AdminPanel>('create-flavor');

  const [flavors, setFlavors] = useState<HumorFlavor[]>([]);
  const [selectedFlavorId, setSelectedFlavorId] = useState<string>('');
  const [steps, setSteps] = useState<HumorFlavorStep[]>([]);
  const [runs, setRuns] = useState<CaptionRun[]>([]);

  const [newFlavorName, setNewFlavorName] = useState('');
  const [newFlavorDescription, setNewFlavorDescription] = useState('');
  const [confirmCreateFlavor, setConfirmCreateFlavor] = useState(false);

  const [stepTitle, setStepTitle] = useState('');
  const [stepInstruction, setStepInstruction] = useState('');

  const [imageUrl, setImageUrl] = useState('');
  const [imageUploadName, setImageUploadName] = useState('');
  const [apiResult, setApiResult] = useState<string>('');
  const [status, setStatus] = useState<string>('');

  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const selectedFlavor = useMemo(
    () => flavors.find((flavor) => flavor.id === selectedFlavorId) ?? null,
    [flavors, selectedFlavorId]
  );

  const loadSteps = useCallback(
    async (flavorId: string) => {
      if (!supabase) return;

      const { data, error } = await supabase
        .from('humor_flavor_steps')
        .select('*')
        .eq('flavor_id', flavorId)
        .order('position', { ascending: true });
      if (error) {
        setStatus(error.message);
        return;
      }
      setSteps(data ?? []);
    },
    [supabase]
  );

  const loadRuns = useCallback(
    async (flavorId: string) => {
      if (!supabase) return;

      const { data, error } = await supabase
        .from('humor_flavor_runs')
        .select('*')
        .eq('flavor_id', flavorId)
        .order('created_datetime_utc', { ascending: false })
        .limit(10);
      if (error) {
        setStatus(error.message);
        return;
      }
      setRuns(data ?? []);
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

    if (data?.[0] && !selectedFlavorId) {
      setSelectedFlavorId(data[0].id);
      await loadSteps(data[0].id);
      await loadRuns(data[0].id);
    }
  }, [loadRuns, loadSteps, selectedFlavorId, supabase]);

  const loadProfile = useCallback(
    async (currentUser: User | null) => {
      if (!supabase || !currentUser) {
        setProfile(null);
        setFlavors([]);
        setSteps([]);
        setRuns([]);
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
        setRuns([]);
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
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      const nextUser = newSession?.user ?? null;
      setUser(nextUser);
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
        redirectTo: `${window.location.origin}/auth/callback`
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

  async function createFlavor(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !profile || !newFlavorName.trim()) return;

    const { error } = await supabase.from('humor_flavors').insert({
      name: newFlavorName.trim(),
      description: newFlavorDescription.trim() || null,
      created_by_user_id: profile.id,
      modified_by_user_id: profile.id
    });

    if (error) {
      setStatus(error.message);
      return;
    }

    setNewFlavorName('');
    setNewFlavorDescription('');
    setConfirmCreateFlavor(false);
    await loadFlavors();
    setStatus('Flavor created.');
  }

  async function updateFlavor(flavor: HumorFlavor) {
    if (!supabase || !profile) return;

    const newName = prompt('New flavor name', flavor.name);
    if (!newName) return;

    const { error } = await supabase
      .from('humor_flavors')
      .update({
        name: newName,
        modified_by_user_id: profile.id
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

    if (!confirm(`Delete flavor "${flavor.name}"?`)) return;
    const { error } = await supabase.from('humor_flavors').delete().eq('id', flavor.id);
    if (error) {
      setStatus(error.message);
      return;
    }
    setSelectedFlavorId('');
    setSteps([]);
    setRuns([]);
    await loadFlavors();
  }

  async function createStep(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !profile || !selectedFlavorId || !stepTitle.trim() || !stepInstruction.trim()) return;

    const nextPos = steps.length ? Math.max(...steps.map((s) => s.position)) + 1 : 1;
    const { error } = await supabase.from('humor_flavor_steps').insert({
      flavor_id: selectedFlavorId,
      position: nextPos,
      title: stepTitle.trim(),
      instruction: stepInstruction.trim(),
      created_by_user_id: profile.id,
      modified_by_user_id: profile.id
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
    if (!supabase || !profile) return;

    const title = prompt('Step title', step.title);
    if (!title) return;
    const instruction = prompt('Step instruction', step.instruction);
    if (!instruction) return;

    const { error } = await supabase
      .from('humor_flavor_steps')
      .update({ title, instruction, modified_by_user_id: profile.id })
      .eq('id', step.id);

    if (error) {
      setStatus(error.message);
      return;
    }
    await loadSteps(step.flavor_id);
  }

  async function deleteStep(step: HumorFlavorStep) {
    if (!supabase) return;

    if (!confirm(`Delete step "${step.title}"?`)) return;

    const { error } = await supabase.from('humor_flavor_steps').delete().eq('id', step.id);
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
      { id: target.id, position: step.position }
    ];

    for (const update of updates) {
      const { error } = await supabase
        .from('humor_flavor_steps')
        .update({ position: update.position, modified_by_user_id: profile.id })
        .eq('id', update.id);
      if (error) {
        setStatus(error.message);
        return;
      }
    }

    await loadSteps(step.flavor_id);
  }

  async function testFlavor(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !profile || !selectedFlavor || !imageUrl.trim()) return;

    const res = await fetch('/api/generate-captions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flavor: selectedFlavor,
        steps,
        imageUrl: imageUrl.trim()
      })
    });

    const payload = (await res.json()) as { error?: string; data?: unknown };
    if (!res.ok) {
      setStatus(payload.error ?? 'Generation failed');
      return;
    }

    setApiResult(JSON.stringify(payload.data, null, 2));

    await supabase.from('humor_flavor_runs').insert({
      flavor_id: selectedFlavor.id,
      image_url: imageUrl.trim(),
      response_json: payload.data,
      created_by_user_id: profile.id,
      modified_by_user_id: profile.id
    });
    await loadRuns(selectedFlavor.id);
    setStatus('Captions generated and saved.');
  }

  function handleImageUpload(file: File | null) {
    if (!file) return;
    setImageUploadName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
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
        <p>Missing Supabase environment variables.</p>
      </main>
    );
  }

  return (
    <main className="container">
      <h1>Humor Flavor Prompt Chain</h1>
      <p className="small">{status}</p>
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
        <>
          <nav className="card emoji-nav" aria-label="Quick actions">
            <a href="#theme" title="Change theme (light, dark, system)" aria-label="Change theme">
              🎨
            </a>
            <a href="#create-flavor" title="Create a humor flavor" aria-label="Create flavor">
              ✨
            </a>
            <a href="#flavors" title="Update or delete a humor flavor" aria-label="Manage flavors">
              🧠
            </a>
            <a href="#steps" title="Create, edit, delete, or reorder humor flavor steps" aria-label="Manage steps">
              🪜
            </a>
            <a href="#test" title="Generate captions for an image using this flavor" aria-label="Test flavor">
              🧪
            </a>
            <a href="#runs" title="Read generated caption history" aria-label="View generated captions">
              📜
            </a>
          </nav>

          <section className="card" id="theme">
            <h2>🎨 Theme</h2>
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

          <section className="card" id="create-flavor">
            <h2>✨ Create humor flavor</h2>
            <form className="grid" onSubmit={createFlavor}>
              <input
                value={newFlavorName}
                onChange={(e) => setNewFlavorName(e.target.value)}
                placeholder="Flavor name"
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
          </section>
          )}

          <section className="card" id="flavors">
            <h2>🧠 Humor flavors</h2>
            <div className="grid">
              {flavors.map((flavor) => (
                <div key={flavor.id} className="card">
                  <div className="row">
                    <button
                      onClick={async () => {
                        setSelectedFlavorId(flavor.id);
                        await loadSteps(flavor.id);
                        await loadRuns(flavor.id);
                      }}
                    >
                      {selectedFlavorId === flavor.id ? 'Selected' : 'Select'}
                    </button>
                    <strong>{flavor.name}</strong>
                  </div>
                  <p>{flavor.description}</p>
                  <div className="row">
                    <button onClick={() => updateFlavor(flavor)}>Rename</button>
                    <button onClick={() => deleteFlavor(flavor)}>Delete</button>
                    <button
                      onClick={async () => {
                        setSelectedFlavorId(flavor.id);
                        await loadSteps(flavor.id);
                        await loadRuns(flavor.id);
                        setActivePanel('test');
                      }}
                    >
                      🧪 Make captions
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          )}

          <section className="card" id="steps">
            <h2>🪜 Steps {selectedFlavor ? `for ${selectedFlavor.name}` : ''}</h2>
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

          <section className="card" id="test">
            <h2>🧪 Test flavor via API</h2>
            <form className="grid" onSubmit={testFlavor}>
              <label className="row">
                <span>Upload image:</span>
                <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e.target.files?.[0] ?? null)} />
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
                  style={{ borderRadius: 8, objectFit: 'cover', width: '280px', height: '180px' }}
                />
              )}
              <button type="submit" disabled={!selectedFlavorId || steps.length === 0}>
                Generate captions
              </button>
            </form>
            {apiResult && <pre>{apiResult}</pre>}
          </section>
          )}

          <section className="card" id="runs">
            <h2>📜 Recent generated captions</h2>
            <div className="grid">
              {runs.map((run) => (
                <div key={run.id} className="card">
                  <p className="small">{new Date(run.created_datetime_utc).toLocaleString()}</p>
                  <p>
                    <strong>Image:</strong> {run.image_url}
                  </p>
                  <pre>{JSON.stringify(run.response_json, null, 2)}</pre>
                </div>
              ))}
            </div>
          </section>
          )}
          </div>

          <aside className="card steps-key">
            <h3>📂 Sections</h3>
            <div className="tabs-list">
              <button onClick={() => setActivePanel('theme')} title="Theme settings">
                🎨 Theme
              </button>
              <button onClick={() => setActivePanel('create-flavor')} title="Create humor flavor">
                ✨ Create
              </button>
              <button onClick={() => setActivePanel('flavors')} title="View/update/delete flavors">
                🧠 Flavors
              </button>
              <button onClick={() => setActivePanel('steps')} title="Manage flavor steps">
                🪜 Steps
              </button>
              <button onClick={() => setActivePanel('test')} title="Generate captions">
                🧪 Test
              </button>
              <button onClick={() => setActivePanel('runs')} title="Generated caption history">
                📜 Runs
              </button>
            </div>
            <h3>🗺️ Steps key</h3>
            <ol>
              <li>Take in an image and output a description in text.</li>
              <li>Take output from step 1 and output something funny about it.</li>
              <li>Take output from step 2 and output five short, funny captions.</li>
            </ol>
            <p className="small">Tip: Create flavor → add steps → click 🧪 Make captions.</p>
          </aside>
        </div>
      )}
    </main>
  );
}
