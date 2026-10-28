import { useEffect, useState } from "react";
import { Share, PlusSquare, Smartphone, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  canPromptInstall,
  dismissInstallBanner,
  installBannerDismissed,
  isIOS,
  isPhoneOrTablet,
  isRunningAsApp,
  onInstallPromptChange,
  promptInstall,
} from "@/lib/install";

function useCanInstall() {
  const [canInstall, setCanInstall] = useState(canPromptInstall);
  useEffect(() => {
    const unsubscribe = onInstallPromptChange(() => setCanInstall(canPromptInstall()));
    return () => {
      unsubscribe();
    };
  }, []);
  return canInstall;
}

// An Install button where the browser supports it, otherwise the steps for
// this device.
function InstallInstructions() {
  const canInstall = useCanInstall();
  if (canInstall) {
    return (
      <Button size="sm" className="self-start" onClick={() => void promptInstall()} data-testid="button-install-app">
        <Download className="h-4 w-4" /> Install app
      </Button>
    );
  }
  if (isIOS()) {
    return (
      <ol className="flex flex-col gap-1.5" data-testid="text-install-ios">
        <li className="flex flex-wrap items-center gap-1.5">
          1. In Safari, tap <Share className="h-4 w-4 text-foreground" aria-label="Share" /> <span className="text-foreground">Share</span>
        </li>
        <li className="flex flex-wrap items-center gap-1.5">
          2. Tap <PlusSquare className="h-4 w-4 text-foreground" aria-hidden />
          <span className="text-foreground">Add to Home Screen</span>
        </li>
      </ol>
    );
  }
  return (
    <p data-testid="text-install-other">
      Open your browser's menu and choose <span className="text-foreground">Install app</span> or{" "}
      <span className="text-foreground">Add to Home screen</span>.
    </p>
  );
}

// "Get the app" card for the profile page. Hidden once opened as an app.
export function InstallAppCard() {
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
        <InstallInstructions />
      </CardContent>
    </Card>
  );
}

// Picks-page banner inviting members on a phone or tablet browser to add the
// app to their home screen. Never shown inside the installed app or on
// desktop; closing it hides it on that device for 30 days.
export function InstallAppBanner() {
  const [closed, setClosed] = useState(installBannerDismissed);
  if (closed || isRunningAsApp() || !isPhoneOrTablet()) return null;
  const close = () => {
    dismissInstallBanner();
    setClosed(true);
  };
  return (
    <div
      className="relative flex flex-col gap-2 rounded-lg border border-accent/40 bg-accent/10 p-4 pr-10 text-sm text-muted-foreground"
      data-testid="banner-install-app"
    >
      <p className="flex items-center gap-2 font-semibold text-foreground">
        <Smartphone className="h-4 w-4 text-accent" /> Get Pick'em on your home screen
      </p>
      <p>Open it like an app, full screen, with one tap.</p>
      <InstallInstructions />
      {/* Positioned by a wrapper: buttons' hover styling forces position: relative. */}
      <div className="absolute right-1.5 top-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={close}
          aria-label="Close"
          data-testid="button-close-install-banner"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
