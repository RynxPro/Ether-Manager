import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { revealLogFolder } from "@/lib/log";
import { ERROR_LINE, PRESS, SECTION_COPY, SECTION_TITLE, SHEET } from "./sheet";

/** Where the app writes down what happened, and the button that finds it.
 *
 * This exists because of the other half of the change that created it: the app now keeps a log,
 * and a log nobody can lay hands on is the same as no log. "Send me the file in
 * %APPDATA%\com.ethermanager.app\logs" is not something to ask of someone who is already
 * annoyed that the app misbehaved, so the button does the finding. */
export function LogSheet() {
  const [error, setError] = useState<string | null>(null);

  async function handleReveal() {
    setError(null);
    try {
      await revealLogFolder();
    } catch (cause) {
      setError(String(cause));
    }
  }

  return (
    <section className={`${SHEET} lg:col-span-2`}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="min-w-[240px] flex-1">
          <h3 className={SECTION_TITLE}>When something goes wrong</h3>
          {/* Says what is in the file, because handing over a log means handing over whatever it
              holds, and that is worth knowing before pressing the button rather than after. */}
          <p className={SECTION_COPY}>
            Ether Manager keeps a log of what it did — folders it touched, downloads it ran, and
            anything that failed. It stays on this machine unless you send it. Nothing is in it
            that is not about this app.
          </p>
        </div>
        <button type="button" className={`${PRESS} bg-secondary text-foreground`} onClick={handleReveal}>
          Show the log
        </button>
      </div>
      {error && (
        <p className={ERROR_LINE}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </section>
  );
}
