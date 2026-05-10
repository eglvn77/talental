import { Card, CardContent } from "@/components/ui/card";

export default function ClientPortalTab() {
  return (
    <Card>
      <CardContent className="text-sm text-muted-foreground">
        Client portal config (per-stage visibility, per-field visibility, allow
        feedback / candidate movement / analytics / notes). Coming soon — schema
        is in place at <code>hiring.role_client_portal_settings</code>.
      </CardContent>
    </Card>
  );
}
