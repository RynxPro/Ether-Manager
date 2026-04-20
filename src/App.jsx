import { useEffect, useState, lazy, Suspense } from "react";
import { GAME_CONFIG } from "./gameConfig";
import { useAppStore } from "./store/useAppStore";
import { useApiStore } from "./store/useApiStore";
import Sidebar from "./components/layout/Sidebar";
import LibraryView from "./views/LibraryView";
import OnboardingModal from "./components/OnboardingModal";
import ErrorBoundary from "./components/ErrorBoundary";
import { motion, AnimatePresence } from "framer-motion";
import AppViewShell from "./components/layout/AppViewShell";
import { WifiOff } from "lucide-react";
import { useNetworkStatus } from "./hooks/useNetworkStatus";
import DevNetworkMonitor from "./components/dev/DevNetworkMonitor";

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
  const updateDownloadProgress = useAppStore(
    (state) => state.updateDownloadProgress,
  );
  const setNsfwMode = useAppStore((state) => state.setNsfwMode);
  const setActiveGameId = useAppStore((state) => state.setActiveGameId);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isBooting, setIsBooting] = useState(false);
  const [bootStatus, setBootStatus] = useState("");
  const isOnline = useNetworkStatus();

  // Global IPC Listeners
  useEffect(() => {
    if (window.electronMods && window.electronMods.onDownloadProgress) {
      return window.electronMods.onDownloadProgress((data) => {
        updateDownloadProgress(data.gbModId, data.percent, data.bytesPerSecond);
      });
    }
  }, [updateDownloadProgress]);

  // Structured Initialization Sequence
  useEffect(() => {
    let mounted = true;

    async function initializeApp() {
      try {
        if (!window.electronConfig) return;

        const config = await window.electronConfig.getConfig();
        if (!mounted) return;

        // Restore preferences safely
        if (config) {
          if (!config.hasSeenOnboarding) {
            setShowOnboarding(true);
          }
          if (typeof setNsfwMode === "function") {
            setNsfwMode(config.nsfwMode ?? "blur");
          }
          if (
            config.lastActiveGameId &&
            typeof setActiveGameId === "function"
          ) {
            setActiveGameId(config.lastActiveGameId);
          }
        }
      } catch (err) {
        console.error("Initialization failed:", err);
      }
    }

    initializeApp();
    return () => {
      mounted = false;
    };
  }, [setNsfwMode, setActiveGameId]);

  const startPolling = useApiStore((state) => state.startStatsPolling);
  const stopPolling = useApiStore((state) => state.stopStatsPolling);

  // Initialize API stats polling (sync cooldown, queue depths, latency in real-time)
  useEffect(() => {
    startPolling();
    return () => {
      stopPolling();
    };
  }, [startPolling, stopPolling]);

  // Update accent color variable when game changes
  useEffect(() => {
    const game = GAME_CONFIG[activeGameId];
    if (game && game.accentColor) {
      document.documentElement.style.setProperty(
        "--color-primary",
        game.accentColor,
      );
    } else {
      // Fallback to a safe default if configuration is missing
      document.documentElement.style.setProperty("--color-primary", "#00f5cc");
    }
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
    <div className="h-screen w-screen flex flex-row bg-background text-text-primary relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-8 z-[100] titlebar-drag pointer-events-auto" />

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

      <Sidebar onShowHelp={handleShowHelp} />

      <main className="flex-1 h-full relative z-10 overflow-hidden">
        <AnimatePresence>
          {!isOnline && (
            <motion.div
              initial={{ opacity: 0, y: -20, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: -20, x: "-50%" }}
              className="absolute top-6 left-1/2 z-50 text-red-500 bg-red-500/10 border border-red-500/20 backdrop-blur-md rounded-full px-4 py-2 flex items-center gap-2 shadow-lg"
            >
              <WifiOff size={16} />
              <span className="text-sm font-medium uppercase tracking-widest">
                Offline Mode
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="flex h-full w-full items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
              </div>
            }
          >
            <AppViewShell isActive={activeView === "browse"}>
              <BrowseView />
            </AppViewShell>

            <AppViewShell isActive={activeView === "presets"}>
              <PresetsView />
            </AppViewShell>

            <AppViewShell
              isActive={activeView === "mods" && !selectedCharacter}
            >
              <LibraryView
                isActive={activeView === "mods" && !selectedCharacter}
              />
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
          </Suspense>
        </ErrorBoundary>
      </main>
      <Suspense fallback={null}>
        <OnboardingModal
          isOpen={showOnboarding}
          onClose={handleCloseOnboarding}
        />
      </Suspense>
      {import.meta.env.DEV && <DevNetworkMonitor />}
      {/* Production API stats monitor (hidden by default, enabled via env) */}
      {import.meta.env.VITE_SHOW_API_STATS === "true" && <DevNetworkMonitor />}
    </div>
  );
}

export default App;
