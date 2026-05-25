import { redirect } from "next/navigation";

// /settings has no landing surface of its own — the user menu in the
// sidebar drops the admin straight into Mi perfil, and the tabs at the
// top let them hop between sections from there. Keeping this as a
// redirect (instead of a tile index) saves the click + matches the
// "click name → land in the editor" pattern the user expects.
export default function SettingsIndex() {
  redirect("/settings/profile");
}
