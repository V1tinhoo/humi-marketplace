import Link from "next/link";
import { ArrowRight, Compass, Gamepad2, MessageCircleHeart, UsersRound, type LucideIcon } from "lucide-react";
import type { Category, CategoryId } from "@/types";
import { cn } from "@/lib/utils";

export const categoryVisuals: Record<CategoryId, { icon: LucideIcon; surface: string; iconWrap: string; pattern: string }> = {
  talk: {
    icon: MessageCircleHeart,
    surface: "bg-blush",
    iconWrap: "bg-white text-plum",
    pattern: "radial-gradient(circle at 85% 15%, #E9BFD3 0 22%, transparent 23%)",
  },
  play: {
    icon: Gamepad2,
    surface: "bg-lilac",
    iconWrap: "bg-plum text-white",
    pattern: "radial-gradient(circle at 90% 90%, #B9A7EF 0 26%, transparent 27%)",
  },
  cultures: {
    icon: Compass,
    surface: "bg-white ring-1 ring-line",
    iconWrap: "bg-lavender text-plum-deep",
    pattern: "repeating-radial-gradient(circle at 100% 0%, transparent 0 14px, #E5DDFB 14px 15px)",
  },
  meet: {
    icon: UsersRound,
    surface: "bg-plum text-white",
    iconWrap: "bg-rose text-plum",
    pattern: "radial-gradient(circle at 15% 110%, #6b6082 0 30%, transparent 31%)",
  },
};

export function CategoryCard({ category, index, browseLabel = "Browse hosts" }: { category: Category; index: number; browseLabel?: string }) {
  const v = categoryVisuals[category.id];
  const dark = category.id === "meet";
  const Icon = v.icon;
  return (
    <Link
      href={`/explore?category=${category.id}`}
      className={cn(
        "group relative flex min-h-64 flex-col overflow-hidden rounded-[var(--radius-card)] p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lift",
        v.surface,
      )}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-80 transition-transform duration-500 group-hover:scale-110" style={{ backgroundImage: v.pattern }} />
      <span className={cn("relative grid size-12 place-items-center rounded-2xl", v.iconWrap)}>
        <Icon className="size-6" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="relative mt-auto pt-10">
        <h3 className={cn("text-xl font-bold tracking-tight", dark ? "text-white" : "text-plum")}>{category.title}</h3>
        <p className={cn("mt-2 text-sm leading-relaxed", dark ? "text-white/80" : "text-plum-soft")}>{category.description}</p>
        <span className={cn("mt-5 inline-flex items-center gap-1.5 text-sm font-semibold", dark ? "text-white" : "text-plum")}>
          {browseLabel}
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
