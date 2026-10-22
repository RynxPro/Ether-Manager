import { AlertTriangle } from "lucide-react";
import { InstallProgressBar } from "@/components/InstallProgressBar";
import {
  useAppUpdate,
  useAppVersion,
  useInstallAppUpdate,
  useSetUpdateChannel,
  useUpdateChannel,
} from "@/lib/useAppUpdate";
import type { UpdateChannel } from "@/lib/tauri-commands";
import { ERROR_LINE, PRESS, SECTION_COPY, SECTION_TITLE, SHEET } from "./sheet";

/** What each channel is for, in the user's terms rather than the release process's. */
const CHANNELS: { value: UpdateChannel; label: string; description: string }[] = [
  {
    value: "Stable",
    label: "Stable",
    description: "Finished releases. What everyone else is running.",
  },
  {
    value: "Nightly",
    label: "Nightly",
    description: "Whatever is being worked on. Expect it to break sometimes.",
  },
];

/** What version is running, whether there is a newer one, and the button that takes it.
 *
 * Last on the page and full width, and not really a setting at all — there is nothing here to
 * configure. It sits with the settings because this is the page people open when they want to
 * know something about the app rather than about their mods, and a one-item About page to hold
 * a version number would be furniture. */
export function AppUpdateSheet() {
  const { data: version } = useAppVersion();
  const { data: update, isLoading, isFetching, error, refetch } = useAppUpdate();
  const { install, isInstalling, error: installError, progress, percent } = useInstallAppUpdate();
  const { data: channel } = useUpdateChannel();
  const switchChannel = useSetUpdateChannel();

  return (
    <section className={`${SHEET} lg:col-span-2`}>
      <div className="flex items-start gap-5">
        <div className="min-w-0 flex-1">
          <h3 className={SECTION_TITLE}>Updates</h3>
          {/* Said plainly because it is the part that is not obvious: the app reaches out on
              its own, and it will refuse anything that is not signed with the key these
              releases are built with. Both facts are ones people are entitled to know about
              software that can replace itself. */}
          <p className={SECTION_COPY}>
            Ether Manager looks for a newer release when it starts. Updates are signed, and
            anything that does not verify is refused rather than installed.
          </p>
        </div>
        {/* The running version, on a plate, in the machine's face — the same treatment the mods
            folder path gets, for the same reason: it is a value the machine holds, not a
            sentence. */}
        <p className="shrink-0 bg-background px-3 py-2.5 font-mono text-[12.5px] font-bold tabular-nums text-foreground shadow-slap">
          {version ? `v${version}` : "—"}
        </p>
      </div>

      {isInstalling ? (
        <div className="mt-4 space-y-2">
          <InstallProgressBar progress={progress} speedBytesPerSec={null} percent={percent} />
          {/* Warned about in advance, because the window disappearing is otherwise
              indistinguishable from a crash at the exact moment someone is least sure what is
              happening. The installer, not the app, is what does this. */}
          <p className={SECTION_COPY}>
            Ether Manager will close while the installer runs, and open again on the new version.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-muted-foreground">
            {isLoading || isFetching
              ? "Checking…"
              : error
                ? "Could not reach the release server."
                : update
                  ? update.is_downgrade
                    ? `This channel is on ${update.version}, behind the ${version ?? "build"} you are running. Installing it would take you back.`
                    : `Version ${update.version} is ready to install.`
                  : "Nothing newer on this channel. This is the current build."}
          </p>
          {update && (
            <button
              type="button"
              className={`${PRESS} ${
                update.is_downgrade
                  ? "bg-background text-foreground"
                  : "bg-primary text-primary-foreground"
              }`}
              onClick={() => install()}
            >
              {update.is_downgrade ? `Go back to ${update.version}` : `Install ${update.version}`}
            </button>
          )}
          {/* Offered in every state, including the one where an update is waiting: a check that
              only appears when it has already failed is a button you cannot find when the
              answer looks stale. Drawn in the wall colour so it reads as the quieter of the two
              when Install is beside it. */}
          <button
            type="button"
            className={`${PRESS} bg-secondary text-foreground`}
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? "Working…" : "Check again"}
          </button>
        </div>
      )}

      {/* The channel, last in the card because it is the rarely-touched half: most people will
          never move off Stable, and the ones who do are looking for it. Two plain buttons rather
          than a switch — a switch would have to imply which side is "on", and neither is. */}
      <div className="mt-4 border-t border-border/60 pt-4">
        <h4 className="font-sign text-[16px] uppercase tracking-[0.16em] text-muted-foreground/80">
          Updates to take
        </h4>
        <div role="radiogroup" aria-label="Update channel" className="mt-2 flex flex-wrap gap-2">
          {CHANNELS.map((option) => {
            const isCurrent = channel === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isCurrent}
                disabled={switchChannel.isPending}
                onClick={() => switchChannel.mutate(option.value)}
                className={`${PRESS} ${
                  isCurrent ? "bg-primary text-primary-foreground" : "bg-background text-foreground"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className={SECTION_COPY}>
          {CHANNELS.find((option) => option.value === channel)?.description ??
            CHANNELS[0].description}
          {channel === "Nightly"
            ? " Switching back to Stable will offer the stable build, even though its number is lower."
            : ""}
        </p>
      </div>

      {update?.notes && (
        <div className="mt-4">
          <h4 className="font-sign text-[16px] uppercase tracking-[0.16em] text-muted-foreground/80">
            What changed
          </h4>
          {/* Whatever the release notes say, laid out as written and capped in height. This is
              text from a server, so it is rendered as text: line breaks are kept, nothing in it
              is interpreted. */}
          <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-line bg-background p-3 text-[12.5px] leading-relaxed text-foreground shadow-slap">
            {update.notes}
          </p>
        </div>
      )}

      {/* Two separate failures and they mean different things — one is "nobody answered", the
          other is "the update itself would not install". Neither leaves the running copy in a
          worse state, which is why both are a line of text rather than a dialog. */}
      {error && (
        <p className={ERROR_LINE}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {String(error)}
        </p>
      )}
      {installError && (
        <p className={ERROR_LINE}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {String(installError)}
        </p>
      )}
    </section>
  );
}
