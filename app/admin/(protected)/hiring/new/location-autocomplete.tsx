"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

declare global {
  interface Window {
    google?: {
      maps?: {
        places?: {
          Autocomplete: new (
            input: HTMLInputElement,
            opts?: {
              fields?: string[];
              types?: string[];
            },
          ) => GoogleAutocomplete;
        };
      };
    };
    __gmapsLoading?: Promise<void>;
  }
}

type GoogleAutocomplete = {
  addListener: (event: string, cb: () => void) => void;
  getPlace: () => {
    place_id?: string;
    formatted_address?: string;
    name?: string;
    geometry?: { location?: { lat: () => number; lng: () => number } };
  };
};

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps?.places) return Promise.resolve();
  if (window.__gmapsLoading) return window.__gmapsLoading;
  window.__gmapsLoading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey,
    )}&libraries=places&v=weekly`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  return window.__gmapsLoading;
}

export function LocationAutocomplete({
  defaultValue,
  apiKey,
}: {
  defaultValue?: string;
  apiKey: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [lat, setLat] = useState<string>("");
  const [lng, setLng] = useState<string>("");
  const [placeId, setPlaceId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey) {
      setError("Missing NEXT_PUBLIC_GOOGLE_MAPS_KEY");
      return;
    }
    let ac: GoogleAutocomplete | null = null;
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !inputRef.current || !window.google?.maps?.places) return;
        ac = new window.google.maps.places.Autocomplete(inputRef.current, {
          fields: ["place_id", "formatted_address", "geometry", "name"],
          types: ["(cities)"],
        });
        ac.addListener("place_changed", () => {
          const place = ac!.getPlace();
          const formatted =
            place.formatted_address ?? place.name ?? inputRef.current?.value ?? "";
          if (inputRef.current) inputRef.current.value = formatted;
          setPlaceId(place.place_id ?? "");
          setLat(place.geometry?.location?.lat().toString() ?? "");
          setLng(place.geometry?.location?.lng().toString() ?? "");
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Maps load failed"));
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  return (
    <div>
      <Input
        ref={inputRef}
        name="location"
        defaultValue={defaultValue}
        placeholder="Empieza a escribir una ciudad…"
        autoComplete="off"
      />
      <input type="hidden" name="location_lat" value={lat} />
      <input type="hidden" name="location_lng" value={lng} />
      <input type="hidden" name="location_place_id" value={placeId} />
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
