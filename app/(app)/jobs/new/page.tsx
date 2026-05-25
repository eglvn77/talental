import { redirect } from "next/navigation";

/**
 * Legacy route. The create-vacante flow is now a modal on /jobs,
 * driven by `?create=1`. Any inbound links to /jobs/new get
 * redirected to the new URL so the modal pops on arrival.
 */
export default function NewRolePageRedirect() {
  redirect("/jobs?create=1");
}
