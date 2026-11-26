import { Card } from "@/components/ui/card";

// The manor prototypes (packages/manor) are separate pages on the same site: publish.sh builds them
// under /manor/. In dev they run on their own server, on this machine, beside this one.
const MANOR_DEV_PORT = 3011;
const MANOR_ROOT = import.meta.env.DEV ? `${window.location.protocol}//${window.location.hostname}:${MANOR_DEV_PORT}/` : "/manor/";

const DEMOS = [
  { page: "index.html", image: "/demos/manor-2d.webp", title: "Open House", caption: "2D · the house in section", alt: "The 2D house in section, with the household at work in its rooms" },
  { page: "demo3d.html", image: "/demos/manor-3d.webp", title: "The Bakery", caption: "3D · the house from above", alt: "The 3D house seen from above, with the household baking and serving customers" },
];

/** Two cards above the game, each opening one of the manor prototypes in a tab of its own. */
export const ManorDemos = () => (
  <div className="flex w-full flex-wrap justify-center gap-4">
    {DEMOS.map(({ page, image, title, caption, alt }) => (
      <a key={page} href={`${MANOR_ROOT}${page}`} target="_blank" rel="noreferrer" className="w-[min(100%,360px)]">
        <Card className="gap-0 overflow-hidden py-0 transition-transform hover:-translate-y-0.5">
          <img className="aspect-video w-full object-cover" src={image} alt={alt} />
          <div className="flex items-baseline justify-between gap-2 px-4 py-3">
            <span className="font-medium">{title}</span>
            <span className="text-muted-foreground text-sm">{caption}</span>
          </div>
        </Card>
      </a>
    ))}
  </div>
);
