import { useState } from "react";
import { X, Download, ChevronDown } from "lucide-react";
import { getAllCharacterNames } from "../lib/portraits";

export default function InstallModal({ mod, game, onClose, onInstall }) {
  const [selectedCharacter, setSelectedCharacter] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState(null);

  const characters = getAllCharacterNames();
  const fileEntry = mod._aFiles && mod._aFiles[0];

  const handleInstall = async () => {
    if (!selectedCharacter) {
      setError("Please select a character first.");
      return;
    }
    if (!fileEntry) {
      setError("No downloadable file found for this mod.");
      return;
    }
    setIsInstalling(true);
    setError(null);
    try {
      await onInstall({
        characterName: selectedCharacter,
        gbModId: mod._idRow,
        fileUrl: fileEntry._sDownloadUrl,
        fileName: fileEntry._sFile,
      });
      onClose();
    } catch (err) {
      setError(err.message || "Installation failed.");
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-[#0f0f1a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl shadow-[var(--active-accent)]/10">
        {/* Thumbnail header */}
        {mod.thumbnailUrl && (
          <div className="relative h-40 w-full overflow-hidden">
            <img src={mod.thumbnailUrl} alt={mod._sName} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f1a] to-transparent" />
          </div>
        )}

        <div className="p-6">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
          >
            <X size={16} />
          </button>

          <h2 className="text-xl font-bold text-white mb-1 pr-8">{mod._sName}</h2>
          <p className="text-sm text-gray-400 mb-5">
            by {mod._aSubmitter?._sName || "Unknown"}
            {fileEntry && (
              <span className="ml-2 text-gray-500 text-xs">
                · {(fileEntry._nFilesize / 1024 / 1024).toFixed(1)} MB
              </span>
            )}
          </p>

          {/* Character select */}
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Install for character
          </label>
          <div className="relative mb-6">
            <select
              value={selectedCharacter}
              onChange={(e) => setSelectedCharacter(e.target.value)}
              className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-4 py-3 pr-10 focus:outline-none focus:border-[var(--active-accent)] appearance-none"
            >
              <option value="" disabled>Select a character...</option>
              {characters.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {error && (
            <p className="text-red-400 text-sm mb-4">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleInstall}
              disabled={isInstalling || !selectedCharacter}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--active-accent)] text-black font-semibold text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isInstalling ? (
                <span className="animate-pulse">Installing...</span>
              ) : (
                <>
                  <Download size={16} />
                  Install Mod
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
