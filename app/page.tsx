'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import type { CaptionRun, HumorFlavor, HumorFlavorStep, Profile } from '@/lib/types';

type ThemeMode = 'light' | 'dark' | 'system';

export default function Page() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<ThemeMode>('system');

  const [flavors, setFlavors] = useState<HumorFlavor[]>([]);
  const [selectedFlavorId, setSelectedFlavorId] = useState<string>('');
  const [steps, setSteps] = useState<HumorFlavorStep[]>([]);
  const [runs, setRuns] = useState<CaptionRun[]>([]);

  const [newFlavorName, setNewFlavorName] = useState('');
  const [newFlavorDescription, setNewFlavorDescription] = useState('');

  const [stepTitle, setStepTitle] = useState('');
  const [stepInstruction, setStepInstruction] = useState('');

  const [imageUrl, setImageUrl] = useState('');
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
        .order('created_at', { ascending: false })
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
      .order('created_at', { ascending: false });
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

  const init = useCallback(async () => {
    setLoading(true);

    if (!supabase) {
      setStatus('Missing Supabase environment variables.');
      setLoading(false);
      return;
    }

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      setStatus('Please log in first.');
      setLoading(false);
      return;
    }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, is_superadmin, is_matrix_admin')
      .eq('id', user.id)
      .single();

    if (!profileData) {
      setStatus('No profile found.');
      setLoading(false);
      return;
    }

    setProfile(profileData);
    await loadFlavors();
    setLoading(false);
  }, [loadFlavors, supabase]);

  useEffect(() => {
    const savedTheme = (localStorage.getItem('theme-mode') as ThemeMode | null) ?? 'system';
    setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme;
    void init();
  }, [init]);

  function isAdmin() {
    return Boolean(profile?.is_superadmin || profile?.is_matrix_admin);
  }

  function setThemeMode(mode: ThemeMode) {
    setTheme(mode);
    localStorage.setItem('theme-mode', mode);
    document.documentElement.dataset.theme = mode;
  }

  async function createFlavor(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !profile || !newFlavorName.trim()) return;

    const { error } = await supabase.from('humor_flavors').insert({
      name: newFlavorName.trim(),
      description: newFlavorDescription.trim() || null,
      created_by: profile.id
    });

    if (error) {
      setStatus(error.message);
      return;
    }

    setNewFlavorName('');
    setNewFlavorDescription('');
    await loadFlavors();
    setStatus('Flavor created.');
  }

  async function updateFlavor(flavor: HumorFlavor) {
    if (!supabase) return;

    const newName = prompt('New flavor name', flavor.name);
    if (!newName) return;

    const { error } = await supabase
      .from('humor_flavors')
      .update({ name: newName })
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
    if (!supabase || !selectedFlavorId || !stepTitle.trim() || !stepInstruction.trim()) return;

    const nextPos = steps.length ? Math.max(...steps.map((s) => s.position)) + 1 : 1;
    const { error } = await supabase.from('humor_flavor_steps').insert({
      flavor_id: selectedFlavorId,
      position: nextPos,
      title: stepTitle.trim(),
      instruction: stepInstruction.trim()
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

    const title = prompt('Step title', step.title);
    if (!title) return;
    const instruction = prompt('Step instruction', step.instruction);
    if (!instruction) return;

    const { error } = await supabase
      .from('humor_flavor_steps')
      .update({ title, instruction })
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
    if (!supabase) return;

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
        .update({ position: update.position })
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
    if (!supabase || !selectedFlavor || !imageUrl.trim()) return;

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
      response_json: payload.data
    });
    await loadRuns(selectedFlavor.id);
    setStatus('Captions generated and saved.');
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

  if (!isAdmin()) {
    return (
      <main className="container">
        <h1>Humor Flavor Prompt Chain</h1>
        <p>Access denied. You must be superadmin or matrix admin.</p>
      </main>
    );
  }

  return (
    <main className="container">
      <h1>Humor Flavor Prompt Chain</h1>
      <p className="small">{status}</p>

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
          <button type="submit">Create flavor</button>
        </form>
      </section>

      <section className="card">
        <h2>Humor flavors</h2>
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
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Steps {selectedFlavor ? `for ${selectedFlavor.name}` : ''}</h2>
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

      <section className="card">
        <h2>Test flavor via API</h2>
        <form className="grid" onSubmit={testFlavor}>
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="Image URL from your test set"
            required
          />
          <button type="submit" disabled={!selectedFlavorId || steps.length === 0}>
            Generate captions
          </button>
        </form>
        {apiResult && <pre>{apiResult}</pre>}
      </section>

      <section className="card">
        <h2>Recent generated captions</h2>
        <div className="grid">
          {runs.map((run) => (
            <div key={run.id} className="card">
              <p className="small">{new Date(run.created_at).toLocaleString()}</p>
              <p>
                <strong>Image:</strong> {run.image_url}
              </p>
              <pre>{JSON.stringify(run.response_json, null, 2)}</pre>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
