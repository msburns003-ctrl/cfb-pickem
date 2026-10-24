import { useEffect, useState } from "react";
import { Share, PlusSquare, Smartphone, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canPromptInstall, isIOS, isRunningAsApp, onInstallPromptChange, promptInstall } from "@/lib/install";

// "Get the app" card for the profile page: an Install button where the
// browser supports it, otherwise instructions. Hidden once opened as an app.
export function InstallAppCard() {
  const [canInstall, setCanInstall] = useState(canPromptInstall);
  useEffect(() => {
    const unsubscribe = onInstallPromptChange(() => setCanInstall(canPromptInstall()));
    return () => {
      unsubscribe();
    };
  }, []);

  if (isRunningAsApp()) return null;

  return (
    <Card data-testid="card-install-app">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-4 w-4" /> Get the app
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
        <p>Add Pick'em to your home screen to open it full screen, like an app.</p>
        {canInstall ? (
          <Button className="self-start" onClick={() => void promptInstall()} data-testid="button-install-app">
            <Download className="h-4 w-4" /> Install app
          </Button>
        ) : isIOS() ? (
          <ol className="flex flex-col gap-1.5" data-testid="text-install-ios">
            <li className="flex items-center gap-1.5">
              1. In Safari, tap <Share className="h-4 w-4 text-foreground" aria-label="Share" /> <span className="text-foreground">Share</span>
            </li>
            <li className="flex items-center gap-1.5">
              2. Tap <PlusSquare className="h-4 w-4 text-foreground" aria-hidden />
              <span className="text-foreground">Add to Home Screen</span>
            </li>
          </ol>
        ) : (
          <p data-testid="text-install-other">
            Open your browser's menu and choose <span className="text-foreground">Install app</span> or{" "}
            <span className="text-foreground">Add to Home screen</span>.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
