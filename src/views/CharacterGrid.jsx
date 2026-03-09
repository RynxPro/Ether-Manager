import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import CharacterCard from "../components/CharacterCard";

export default function CharacterGrid({ game, onSelectCharacter }) {
  const [mods, setMods] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function loadMods() {
      if (window.electronConfig && window.electronMods) {
        const config = await window.electronConfig.getConfig();
        const importerPath = config[game.id];
        if (importerPath) {
          const loadedMods = await window.electronMods.getMods(importerPath);
          setMods(loadedMods);
        } else {
          setMods([]);
        }
      }
    }
    loadMods();
  }, [game.id]);

  // Group mods by character
  const charactersMap = new Map();
  mods.forEach((mod) => {
    if (!charactersMap.has(mod.character)) {
      charactersMap.set(mod.character, {
        name: mod.character,
        totalMods: 0,
        enabledMods: 0,
        disabledMods: 0,
        mods: [],
      });
    }

    const charData = charactersMap.get(mod.character);
    charData.totalMods++;
    charData.mods.push(mod);
    if (mod.isEnabled) {
      charData.enabledMods++;
    } else {
      charData.disabledMods++;
    }
  });

  const characters = Array.from(charactersMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const filteredCharacters = characters.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Sub-header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">{game.name}</h1>
          <p className="text-gray-400">
            {characters.length} characters · {mods.length} mods
          </p>
        </div>

        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            size={18}
          />
          <input
            type="text"
            placeholder="Search characters..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-[var(--active-accent)] focus:bg-white/10 transition-all w-64"
          />
        </div>
      </div>

      {mods.length === 0 && !searchQuery ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-white/5 border border-white/5 rounded-2xl border-dashed">
          <h3 className="text-xl font-medium text-white mb-2">No Mods Found</h3>
          <p className="text-gray-400 max-w-md">
            Please make sure you have configured the correct {game.name}{" "}
            importer path in settings, and that the Mods folder contains
            subfolders.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-12">
          {filteredCharacters.map((char) => (
            <CharacterCard
              key={char.name}
              character={char}
              onClick={() => onSelectCharacter(char)}
            />
          ))}

          {filteredCharacters.length === 0 && searchQuery && (
            <div className="col-span-full py-12 text-center text-gray-400">
              No characters found matching "{searchQuery}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
