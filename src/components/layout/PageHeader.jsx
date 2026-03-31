import { cn } from "../../lib/utils";

export default function PageHeader({
  eyebrow,
  title,
  description,
  actions = null,
  children = null,
  className = "",
}) {
  return (
    <header className={cn("mb-8 px-2", className)}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <div className="ui-eyebrow mb-3">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="text-4xl font-bold tracking-tighter text-text-primary drop-shadow-xl md:text-[2.75rem]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm font-medium text-text-secondary md:text-base">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-3">{actions}</div>
        ) : null}
      </div>

      {children ? <div className="mt-6">{children}</div> : null}
    </header>
  );
}
