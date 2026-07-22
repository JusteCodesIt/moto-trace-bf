import { LucideIcon } from "lucide-react";

export function SectionHero({
  eyebrow,
  title,
  description,
  image,
  icon: Icon,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  image: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}) {
  return (
    <section
      className="card-elev overflow-hidden relative grid md:grid-cols-[1fr_260px] gap-6 p-6 md:p-8 mb-6"
      style={{
        background:
          "linear-gradient(120deg, color-mix(in oklab, var(--accent-primary) 7%, var(--bg-surface)) 0%, var(--bg-surface) 62%)",
      }}
    >
      <div
        aria-hidden
        className="absolute -top-24 -right-24 size-72 rounded-full opacity-[0.10] blur-[110px]"
        style={{ background: "var(--accent-primary)" }}
      />
      <div className="relative z-10 flex flex-col justify-center">
        {eyebrow && (
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--accent-primary)] mb-2 flex items-center gap-2">
            {Icon && <Icon className="size-3.5" />} {eyebrow}
          </span>
        )}
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-[var(--text-primary)] leading-tight font-display">
          {title}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-lg leading-relaxed">
          {description}
        </p>
        {actions && <div className="mt-5 flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="relative z-10 hidden md:flex items-center justify-center">
        <img
          src={image}
          alt=""
          className="w-full max-w-[260px] h-auto object-contain drop-shadow-[0_8px_24px_rgba(30,64,255,0.18)]"
        />
      </div>
    </section>
  );
}
