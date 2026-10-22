import { AlertTriangle } from "lucide-react";
import { InstallProgressBar } from "@/components/InstallProgressBar";
import { useAppUpdate, useAppVersion, useInstallAppUpdate } from "@/lib/useAppUpdate";
import { exactDate } from "@/lib/time";
import { ERROR_LINE, PRESS, SECTION_COPY, SECTION_TITLE, SHEET } from "./sheet";

/** The update's own date, when the release carried one.
 *
 * Guarded rather than trusted: the field is whatever the manifest put there, and an
 * unparseable string would otherwise render as "Invalid Date" in the one place claiming to
 * report a fact. Nothing is lost by saying nothing. */
function publishedOn(raw: string | undefined): string | null {
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : exactDate(parsed / 1000);
}

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
                  ? `Version ${update.version} is ready to install.`
                  : "No newer release. This is the current build."}
          </p>
          {update && (
            <button
              type="button"
              className={`${PRESS} bg-primary text-primary-foreground`}
              onClick={() => install(update)}
            >
              Install {update.version}
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

      {update?.body && (
        <div className="mt-4">
          <h4 className="font-sign text-[16px] uppercase tracking-[0.16em] text-muted-foreground/80">
            What changed
            {publishedOn(update.date) ? ` — ${publishedOn(update.date)}` : ""}
          </h4>
          {/* Whatever the release notes say, laid out as written and capped in height. This is
              text from a server, so it is rendered as text: line breaks are kept, nothing in it
              is interpreted. */}
          <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-line bg-background p-3 text-[12.5px] leading-relaxed text-foreground shadow-slap">
            {update.body}
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
