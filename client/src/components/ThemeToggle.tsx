import { Moon, Sun, Monitor, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTheme, type ThemePreference } from "@/lib/theme";

const options: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "Match device", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={className} aria-label="Theme" data-testid="button-theme">
          <Sun className="h-4 w-4 dark:hidden" />
          <Moon className="hidden h-4 w-4 dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem key={value} onSelect={() => setPreference(value)} data-testid={`menu-theme-${value}`}>
            <Icon className="h-4 w-4" />
            <span className="flex-1">{label}</span>
            {preference === value && <Check className="h-4 w-4" aria-label="selected" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
