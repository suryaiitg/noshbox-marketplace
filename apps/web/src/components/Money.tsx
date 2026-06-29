/** Render integer cents as a dollar string. Keep money formatting in one place. */
export function Money({ cents }: { cents: number }) {
  const sign = cents < 0 ? '-' : '';
  return <span>{`${sign}$${(Math.abs(cents) / 100).toFixed(2)}`}</span>;
}
