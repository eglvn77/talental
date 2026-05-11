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
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [placeId, setPlaceId] = useState("");

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    let observer: MutationObserver | null = null;
    let errorCheckInterval: ReturnType<typeof setInterval> | null = null;
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !inputRef.current || !window.google?.maps?.places) return;
        try {
          const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
            fields: ["place_id", "formatted_address", "geometry", "name"],
            types: ["(cities)"],
          });
          ac.addListener("place_changed", () => {
            const place = ac.getPlace();
            const formatted =
              place.formatted_address ?? place.name ?? inputRef.current?.value ?? "";
            if (inputRef.current) inputRef.current.value = formatted;
            setPlaceId(place.place_id ?? "");
            setLat(place.geometry?.location?.lat().toString() ?? "");
            setLng(place.geometry?.location?.lng().toString() ?? "");
          });
          // Prevent Google from disabling the input or injecting error UI on API key errors
          const input = inputRef.current;
          const origPlaceholder = input.placeholder;
          observer = new MutationObserver(() => {
            if (input.disabled) input.disabled = false;
            if (input.style.backgroundImage) input.style.backgroundImage = "none";
            if (input.placeholder !== origPlaceholder) input.placeholder = origPlaceholder;
          });
          observer.observe(input, { attributes: true, attributeFilter: ["disabled", "style", "placeholder"] });
          // Google sets input.value to "Oops!" on auth failure — value changes don't trigger MutationObserver
          errorCheckInterval = setInterval(() => {
            if (input.value.includes("Oops") || input.value.includes("went wrong")) {
              input.value = defaultValue ?? "";
              if (errorCheckInterval) clearInterval(errorCheckInterval);
            }
          }, 500);
          setTimeout(() => { if (errorCheckInterval) clearInterval(errorCheckInterval); }, 10000);
        } catch {
          // Autocomplete failed — input stays usable as plain text
        }
      })
      .catch(() => {
        // Google Maps failed to load — input stays usable as plain text
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      if (errorCheckInterval) clearInterval(errorCheckInterval);
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
    </div>
  );
}
