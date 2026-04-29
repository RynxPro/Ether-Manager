import { useState, useEffect } from "react";

const SUPPORTERS_URL =
  "https://aether-supporters.wynxlunarstar.workers.dev/supporters";

export function useSupporters() {
  const [supporters, setSupporters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSupporters = async () => {
      try {
        const response = await fetch(SUPPORTERS_URL);

        if (!response.ok) {
          throw new Error(`Failed to load supporters (${response.status})`);
        }

        const data = await response.json();
        setSupporters(data || []);
        setError(null);
      } catch (err) {
        console.error("Supporters fetch error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchSupporters();
  }, []);

  return { supporters, loading, error };
}
