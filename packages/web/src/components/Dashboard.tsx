import { useState, useEffect } from "react";

const API_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:3001";

interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  status: string;
  version: number;
  updated_at: string;
}

export default function Dashboard() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPipelines();
  }, []);

  async function fetchPipelines() {
    try {
      const token = localStorage.getItem("automate_token");
      const res = await fetch(`${API_URL}/api/pipelines`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setPipelines(await res.json());
    } catch (err) {
      console.error("Failed to fetch pipelines:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">My Pipelines</h1>
          <a
            href="/pipelines/new"
            className="px-6 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg font-semibold transition"
          >
            + New Pipeline
          </a>
        </div>

        {pipelines.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-xl mb-4">No pipelines yet</p>
            <p>Create your first AI pipeline to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {pipelines.map((p) => (
              <a
                key={p.id}
                href={`/pipelines/${p.id}`}
                className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-gray-600 transition block"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold">{p.name}</h3>
                    {p.description && (
                      <p className="text-gray-400 mt-1">{p.description}</p>
                    )}
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    <div>v{p.version}</div>
                    <div>{new Date(p.updated_at).toLocaleDateString()}</div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
