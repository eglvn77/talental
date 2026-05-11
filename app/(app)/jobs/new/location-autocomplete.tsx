"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * Programmatic Google Places autocomplete for cities. Uses the JS SDK's
 * AutocompleteService.getPlacePredictions() + PlacesService.getDetails()
 * with a custom dropdown — NOT the legacy `Autocomplete` widget that
 * hijacks the input and breaks on auth errors.
 *
 * Falls back to a plain text input if the Maps script fails to load.
 */

type Prediction = {
  place_id: string;
  description: string;
};

type GooglePrediction = {
  place_id: string;
  description: string;
};

type GooglePlaceResult = {
  formatted_address?: string;
  name?: string;
  geometry?: { location?: { lat: () => number; lng: () => number } };
};

type AutocompleteService = {
  getPlacePredictions: (
    req: {
      input: string;
      types?: string[];
      componentRestrictions?: { country: string[] };
      language?: string;
    },
    cb: (predictions: GooglePrediction[] | null, status: string) => void,
  ) => void;
};

type PlacesService = {
  getDetails: (
    req: { placeId: string; fields: string[] },
    cb: (place: GooglePlaceResult | null, status: string) => void,
  ) => void;
};

type GooglePlacesNS = {
  AutocompleteService: new () => AutocompleteService;
  PlacesService: new (attribution: HTMLElement) => PlacesService;
  PlacesServiceStatus: { OK: string };
};

declare global {
  interface Window {
    google?: { maps?: { places?: GooglePlacesNS } };
    __gmapsLoading?: Promise<void>;
  }
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps?.places) return Promise.resolve();
  if (window.__gmapsLoading) return window.__gmapsLoading;
  window.__gmapsLoading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey,
    )}&libraries=places&v=weekly&language=es`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  return window.__gmapsLoading;
}

const LATAM_COUNTRIES = ["mx", "br", "ar", "co", "cl"]; // ComponentRestrictions max 5.

export function LocationAutocomplete({
  defaultValue,
  apiKey,
}: {
  defaultValue?: string;
  apiKey: string;
}) {
  const [query, setQuery] = useState(defaultValue ?? "");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [lat, setLat] = useState<string>("");
  const [lng, setLng] = useState<string>("");
  const [placeId, setPlaceId] = useState<string>("");
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);

  const wrapRef = useRef<HTMLDivElement>(null);
  const servicesRef = useRef<{
    autocomplete: AutocompleteService | null;
    places: PlacesService | null;
  }>({ autocomplete: null, places: null });

  // Initialize services on mount (or never, if key missing / script fails).
  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled) return;
        const places = window.google?.maps?.places;
        if (!places) return;
        const attribution = document.createElement("div");
        servicesRef.current = {
          autocomplete: new places.AutocompleteService(),
          places: new places.PlacesService(attribution),
        };
        setReady(true);
      })
      .catch(() => {
        /* fallback to plain input */
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  // Click-outside to close the dropdown.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Debounced predictions fetch.
  useEffect(() => {
    if (!ready || !servicesRef.current.autocomplete) return;
    const q = query.trim();
    if (q.length < 2) {
      setPredictions([]);
      return;
    }
    const t = setTimeout(() => {
      servicesRef.current.autocomplete!.getPlacePredictions(
        {
          input: q,
          types: ["(cities)"],
          componentRestrictions: { country: LATAM_COUNTRIES },
          language: "es",
        },
        (preds) => {
          setPredictions(
            (preds ?? []).slice(0, 5).map((p) => ({
              place_id: p.place_id,
              description: p.description,
            })),
          );
          setHighlight(-1);
        },
      );
    }, 200);
    return () => clearTimeout(t);
  }, [query, ready]);

  function pick(p: Prediction) {
    setQuery(p.description);
    setPredictions([]);
    setOpen(false);
    setPlaceId(p.place_id);
    const placesSvc = servicesRef.current.places;
    if (!placesSvc) return;
    placesSvc.getDetails(
      { placeId: p.place_id, fields: ["geometry", "formatted_address", "name"] },
      (place, status) => {
        const ok =
          status === window.google?.maps?.places?.PlacesServiceStatus.OK;
        if (!ok || !place?.geometry?.location) {
          setLat("");
          setLng("");
          return;
        }
        setLat(place.geometry.location.lat().toString());
        setLng(place.geometry.location.lng().toString());
      },
    );
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || predictions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, predictions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && highlight >= 0) {
      e.preventDefault();
      pick(predictions[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <Input
        type="text"
        name="location"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          // Clear lat/lng if the user edits after picking — they're stale.
          setLat("");
          setLng("");
          setPlaceId("");
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Empieza a escribir una ciudad…"
        autoComplete="off"
      />
      <input type="hidden" name="location_lat" value={lat} />
      <input type="hidden" name="location_lng" value={lng} />
      <input type="hidden" name="location_place_id" value={placeId} />

      {open && predictions.length > 0 ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-border bg-background shadow-lg">
          {predictions.map((p, i) => (
            <button
              key={p.place_id}
              type="button"
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(p)}
              className={
                "block w-full px-3 py-2 text-left text-sm hover:bg-muted " +
                (i === highlight ? "bg-muted" : "")
              }
            >
              {p.description}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
