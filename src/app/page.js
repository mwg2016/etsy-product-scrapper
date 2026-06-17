"use client";

import { useEffect, useState } from "react";

function toCSV(rows) {
  const cols = [
    "listing_id",
    "title",
    "variant",
    "sku",
    "price",
    "currency",
    "quantity",
    "available",
    "source",
    "url",
  ];
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(","));
  return lines.join("\n");
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [shop, setShop] = useState("CustomCooper");
  const [limit, setLimit] = useState(20);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [shopName, setShopName] = useState(null);
  const [authError, setAuthError] = useState("");

  function refreshStatus() {
    fetch("/api/auth/etsy/status")
      .then((r) => r.json())
      .then((j) => {
        setConnected(Boolean(j.connected));
        setShopName(j.shopName || null);
      })
      .catch(() => {});
  }

  useEffect(() => {
    refreshStatus();
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth_error")) {
      setAuthError(decodeURIComponent(params.get("auth_error")));
    }
    if (params.get("connected")) {
      window.history.replaceState({}, "", "/");
    }
  }, []);

  async function disconnect() {
    await fetch("/api/auth/etsy/logout", { method: "POST" });
    setConnected(false);
    setShopName(null);
  }

  async function fetchData(e) {
    e?.preventDefault();
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await fetch(
        `/api/products?shop=${encodeURIComponent(shop)}&limit=${limit}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const rows = data?.rows || [];

  return (
    <main className="max-w-6xl mx-auto p-6 font-sans w-full">
      <h1 className="text-2xl font-bold mb-1">Etsy Shop Scraper</h1>
      <p className="text-sm opacity-70 mb-4">
        Variant prices &amp; inventory — Etsy Open API v3
      </p>

      <div className="flex items-center gap-3 mb-6 text-sm">
        {connected ? (
          <>
            <span className="inline-flex items-center gap-2 text-green-600">
              ● Connected{shopName ? `: ${shopName}` : " (OAuth)"}
            </span>
            <button
              onClick={disconnect}
              className="border rounded px-3 py-1 text-xs"
            >
              Disconnect
            </button>
          </>
        ) : (
          <a
            href="/api/auth/etsy/login"
            className="bg-[#f56400] text-white rounded px-4 py-2 font-medium"
          >
            Connect Etsy
          </a>
        )}
      </div>

      {authError && (
        <div className="border border-red-400 text-red-600 rounded p-3 mb-4 text-sm whitespace-pre-wrap">
          OAuth error: {authError}
        </div>
      )}

      <form onSubmit={fetchData} className="flex flex-wrap gap-3 items-end mb-6">
        <label className="flex flex-col text-sm">
          Shop name
          <input
            value={shop}
            onChange={(e) => setShop(e.target.value)}
            className="border rounded px-3 py-2 mt-1 bg-transparent"
            placeholder="CustomCooper"
          />
        </label>
        <label className="flex flex-col text-sm">
          Limit
          <input
            type="number"
            min={1}
            max={100}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="border rounded px-3 py-2 mt-1 w-24 bg-transparent"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="bg-black text-white dark:bg-white dark:text-black rounded px-5 py-2 font-medium disabled:opacity-50"
        >
          {loading ? "Fetching…" : "Fetch products"}
        </button>
      </form>

      {error && (
        <div className="border border-red-400 text-red-600 rounded p-3 mb-4 text-sm whitespace-pre-wrap">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="flex flex-wrap gap-3 items-center mb-3 text-sm">
            <span>
              <b>{data.shop}</b> — {data.listingCount} listings, {data.rowCount}{" "}
              rows
            </span>
            <button
              onClick={() =>
                download("etsy-products.csv", toCSV(rows), "text/csv")
              }
              className="border rounded px-3 py-1"
            >
              Export CSV
            </button>
            <button
              onClick={() =>
                download(
                  "etsy-products.json",
                  JSON.stringify(rows, null, 2),
                  "application/json"
                )
              }
              className="border rounded px-3 py-1"
            >
              Export JSON
            </button>
          </div>

          {data.warnings?.length > 0 && (
            <div className="border border-amber-400 text-amber-700 rounded p-3 mb-4 text-xs">
              {data.warnings.map((w, i) => (
                <div key={i}>⚠ {w}</div>
              ))}
            </div>
          )}

          <div className="overflow-x-auto border rounded">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-black/5 dark:bg-white/10">
                <tr>
                  {["Title", "Variant", "SKU", "Price", "Qty", "Avail", "Src"].map(
                    (h) => (
                      <th key={h} className="text-left p-2 font-medium">
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-black/10">
                    <td className="p-2 max-w-xs truncate">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {r.title}
                      </a>
                    </td>
                    <td className="p-2">{r.variant}</td>
                    <td className="p-2">{r.sku}</td>
                    <td className="p-2 whitespace-nowrap">
                      {r.price != null ? `${r.price} ${r.currency || ""}` : "—"}
                    </td>
                    <td className="p-2">{r.quantity ?? "—"}</td>
                    <td className="p-2">{r.available}</td>
                    <td className="p-2 opacity-60">{r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
