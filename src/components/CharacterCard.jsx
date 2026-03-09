import { cn } from "../lib/utils";
import { User } from "lucide-react";
import { getCharacterPortrait } from "../lib/portraits";

export default function CharacterCard({ character, onClick }) {
  const portraitUrl = getCharacterPortrait(character.name);

  // Generate a consistent gradient based on character name for placeholder
  const getGradient = (name) => {
    const hash = name
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const hues = [0, 45, 120, 180, 240, 280, 320]; // Pinks, Blues, Greens, etc
    const hue = hues[hash % hues.length];

    return `linear-gradient(135deg, hsl(${hue}, 80%, 40%) 0%, hsl(${(hue + 40) % 360}, 100%, 20%) 100%)`;
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "glass-card rounded-xl overflow-hidden cursor-pointer group glow-border transition-all duration-300",
        "hover:-translate-y-1 hover:shadow-2xl hover:shadow-[var(--active-accent)]/20",
      )}
    >
      {/* Portrait Area */}
      <div
        className="h-[180px] w-full relative content-center items-center justify-center flex bg-cover bg-center"
        style={{
          background: portraitUrl
            ? `url(${portraitUrl}) center/cover no-repeat`
            : getGradient(character.name),
        }}
      >
        {!portraitUrl && <User size={64} className="text-white/30" />}

        {/* Mod count badge */}
        <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-xs font-bold text-white border border-white/20 shadow-lg group-hover:bg-[var(--active-accent)] group-hover:text-black group-hover:border-[var(--active-accent)] transition-colors">
          {character.totalMods}
        </div>
      </div>

      {/* Info Area */}
      <div className="p-4 bg-[#0f0f1a]">
        <h3 className="text-xl font-bold text-white mb-1 truncate">
          {character.name}
        </h3>
        <p className="text-sm text-[var(--active-accent)] font-medium">
          {character.totalMods} mods · {character.enabledMods} enabled
        </p>
      </div>
    </div>
  );
}
