// Loading skeletons.
export function Skeleton({ h = 16, w = "100%", r = 6, style }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r, ...style }} />;
}

// A card-shaped skeleton block for dashboards.
export function SkeletonCard() {
  return (
    <div className="card skeleton-stack">
      <Skeleton h={22} w="40%" />
      <Skeleton h={14} w="90%" />
      <Skeleton h={14} w="75%" />
      <Skeleton h={40} w="100%" />
    </div>
  );
}
