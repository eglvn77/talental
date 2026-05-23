"use client";

import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { Input } from "@/components/ui/input";

/**
 * City autocomplete on top of Places API (New). Uses
 * AutocompleteSuggestion.fetchAutocompleteSuggestions + Place.fetchFields
 * (no legacy AutocompleteService / PlacesService — those require the
 * deprecated Places API to be enabled in GCP).
 *
 * Global by design — `includedRegionCodes` intentionally omitted so
 * the autocomplete works for candidates / clients anywhere in the
 * world. Don't add a region restriction here without an explicit
 * product reason; the platform is multi-region by default.
 *
 * Falls back to a plain text input if the Maps JS SDK fails to load.
 */

type Suggestion = {
  placeId: string;
  text: string;
};

// Minimal shapes for the Places (New) types we use. Avoids depending on
// @types/google.maps which would also pull in legacy type defs.
type PlaceLocation = { lat: () => number; lng: () => number };
type Place = {
  fetchFields: (req: { fields: string[] }) => Promise<unknown>;
  displayName: string | null;
  formattedAddress: string | null;
  location: PlaceLocation | null;
  id: string;
};
type PlacePrediction = {
  placeId: string;
  text: { text: string } | string;
  toPlace: () => Place;
};
type AutocompleteSuggestion = { placePrediction: PlacePrediction | null };
type PlacesNS = {
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (req: {
      input: string;
      includedRegionCodes?: string[];
      includedPrimaryTypes?: string[];
      language?: string;
    }) => Promise<{ suggestions: AutocompleteSuggestion[] }>;
  };
};

export function LocationAutocomplete({
  defaultValue,
  defaultPlaceId,
  apiKey,
  onChange,
}: {
  defaultValue?: string;
  defaultPlaceId?: string;
  apiKey: string;
  onChange?: (loc: {
    location: string;
    placeId: string;
    lat: string;
    lng: string;
  }) => void;
}) {
  const [query, setQuery] = useState(defaultValue ?? "");
  const [predictions, setPredictions] = useState<Suggestion[]>([]);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [placeId, setPlaceId] = useState(defaultPlaceId ?? "");
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const wrapRef = useRef<HTMLDivElement>(null);
  const placesRef = useRef<PlacesNS | null>(null);

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    setOptions({ key: apiKey, v: "weekly", language: "es" });
    importLibrary("places")
      .then((places) => {
        if (cancelled) return;
        placesRef.current = places as unknown as PlacesNS;
        setReady(true);
      })
      .catch(() => {
        /* fallback to plain input */
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Debounced suggestion fetch.
  useEffect(() => {
    if (!ready || !placesRef.current) return;
    const q = query.trim();
    if (q.length < 2) {
      setPredictions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { suggestions } =
          await placesRef.current!.AutocompleteSuggestion.fetchAutocompleteSuggestions(
            {
              input: q,
              // No includedRegionCodes — searches globally so the same
              // picker works for candidates / clients anywhere.
              includedPrimaryTypes: ["(cities)"],
              language: "es",
            },
          );
        if (cancelled) return;
        setPredictions(
          suggestions
            .map((s) => s.placePrediction)
            .filter((p): p is PlacePrediction => Boolean(p))
            .slice(0, 5)
            .map((p) => ({
              placeId: p.placeId,
              text: typeof p.text === "string" ? p.text : p.text.text,
            })),
        );
        setHighlight(-1);
      } catch {
        /* network/auth error — drop silently, input remains usable */
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, ready]);

  async function pick(s: Suggestion) {
    setQuery(s.text);
    setPredictions([]);
    setOpen(false);
    setPlaceId(s.placeId);

    let pickedLat = "";
    let pickedLng = "";
    const places = placesRef.current;
    if (places) {
      try {
        const Ctor = (
          places as unknown as { Place: new (init: { id: string }) => Place }
        ).Place;
        const place = new Ctor({ id: s.placeId });
        await place.fetchFields({ fields: ["location", "formattedAddress"] });
        if (place.location) {
          pickedLat = place.location.lat().toString();
          pickedLng = place.location.lng().toString();
          setLat(pickedLat);
          setLng(pickedLng);
        }
      } catch {
        /* details fetch failed — keep name + place_id, lose lat/lng */
      }
    }
    onChange?.({
      location: s.text,
      placeId: s.placeId,
      lat: pickedLat,
      lng: pickedLng,
    });
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
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-border bg-background shadow-dropdown">
          {predictions.map((p, i) => (
            <button
              key={p.placeId}
              type="button"
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(p)}
              className={
                "block w-full px-3 py-2 text-left text-sm hover:bg-muted " +
                (i === highlight ? "bg-muted" : "")
              }
            >
              {p.text}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
