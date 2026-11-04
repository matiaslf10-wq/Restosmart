/** Shared ecosystem wordmark: same font and weight contrast as TiendaSmart. */
export default function BrandWordmark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`whitespace-nowrap ${className}`}
      style={{ fontFamily: 'Arial, Helvetica, sans-serif', letterSpacing: '-0.043em' }}
    >
      <span style={{ fontWeight: 750 }}>Resto</span><span style={{ fontWeight: 400 }}>Smart</span>
    </span>
  );
}
