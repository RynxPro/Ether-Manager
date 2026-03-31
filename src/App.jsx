import { useEffect, useState, lazy } from "react";
import { GAME_CONFIG } from "./gameConfig";
import { useAppStore } from "./store/useAppStore";
import Navbar from "./components/Navbar";
import LibraryView from "./views/LibraryView";
import OnboardingModal from "./components/OnboardingModal";
import ErrorBoundary from "./components/ErrorBoundary";
import { motion, AnimatePresence } from "framer-motion";
import AppViewShell from "./components/layout/AppViewShell";

const CharacterDetail = lazy(() => import("./views/CharacterDetail"));
const BrowseView = lazy(() => import("./views/BrowseView"));
const PresetsView = lazy(() => import("./views/PresetsView"));

function App() {
  const activeGameId = useAppStore((state) => state.activeGameId);
  const selectedCharacter = useAppStore((state) => state.selectedCharacter);
  const activeView = useAppStore((state) => state.activeView);
  const setSelectedCharacter = useAppStore(
    (state) => state.setSelectedCharacter,
  );
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    async function checkOnboarding() {
      if (window.electronConfig) {
        const config = await window.electronConfig.getConfig();
        if (!config.hasSeenOnboarding) {
          setShowOnboarding(true);
        }
      }
    }
    checkOnboarding();
  }, []);

  // Update accent color variable when game changes
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--color-primary",
      GAME_CONFIG[activeGameId].accentColor,
    );
  }, [activeGameId]);

  const handleCloseOnboarding = async () => {
    setShowOnboarding(false);
    if (window.electronConfig) {
      await window.electronConfig.setConfig({ hasSeenOnboarding: true });
    }
  };

  const handleShowHelp = () => {
    setShowOnboarding(true);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-text-primary relative overflow-hidden">
      {/* Background radial gradient corresponding to game color */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: `radial-gradient(circle at 50% -20%, var(--color-primary) 0%, transparent 60%)`,
          opacity: 0.1,
        }}
      />

      {/* Dynamic Texture/Depth Layer */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.03] mix-blend-overlay">
        <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <filter id="n" x="0" y="0">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.65"
              stitchTiles="stitch"
            />
          </filter>
          <rect width="100%" height="100%" filter="url(#n)" />
        </svg>
      </div>

      <Navbar onShowHelp={handleShowHelp} />

      <main className="flex-1 w-full relative z-10 overflow-hidden">
        <ErrorBoundary>
          <AppViewShell isActive={activeView === "browse"}>
            <BrowseView />
          </AppViewShell>

          <AppViewShell isActive={activeView === "presets"}>
            <PresetsView />
          </AppViewShell>

          <AppViewShell isActive={activeView === "mods" && !selectedCharacter}>
            <LibraryView isActive={activeView === "mods" && !selectedCharacter} />
          </AppViewShell>

          {/* MOD DETAIL VIEWPORT (conditionally rendered to save memory when inactive) */}
          <AnimatePresence>
            {activeView === "mods" && selectedCharacter && (
              <AppViewShell isActive={true} zIndex={30}>
                <motion.div
                  key="mod-detail"
                  initial={{ opacity: 0, y: 15, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -15, scale: 1.02 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full w-full"
                >
                  <CharacterDetail
                    character={selectedCharacter}
                    onBack={() => setSelectedCharacter(null)}
                  />
                </motion.div>
              </AppViewShell>
            )}
          </AnimatePresence>
        </ErrorBoundary>
      </main>
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={handleCloseOnboarding}
      />
    </div>
  );
}

export default App;
