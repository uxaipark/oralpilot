import { useLocalize } from '@/lib/i18n/provider';
import { toothIconShape } from '@/lib/tooth-icon';

export function ToothIcon({ fdi, status }: { fdi: number; status?: string }) {
  const localize = useLocalize();
  const shape = toothIconShape(fdi);
  const missing = status === 'missing',
    implant = status === 'implant';
  return localize(
    <svg
      className={`tooth-icon${missing ? ' missing' : ''}${implant ? ' restored' : ''}`}
      viewBox="0 0 36 60"
      aria-hidden="true"
      focusable="false"
    >
      <g
        transform={shape.transform}
        strokeLinejoin="round"
        strokeLinecap="round"
        strokeWidth="1.25"
      >
        {implant ? (
          <g className="tooth-icon-fixture">
            <path d="M 13 31 L 14 10 Q 18 5 22 10 L 23 31 Z" />
            {[12, 17, 22, 27].map((y) => (
              <path key={y} d={`M 13 ${y + 2} L 23 ${y - 1}`} fill="none" />
            ))}
          </g>
        ) : (
          <g className="tooth-icon-root">
            {shape.roots.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        )}
        <path className="tooth-icon-crown" d={shape.crown} />
        <path className="tooth-icon-detail" d={shape.fissures} fill="none" />
      </g>
      {missing && <path className="tooth-icon-missing" d="M 7 45 L 29 15" />}
    </svg>,
  );
}
