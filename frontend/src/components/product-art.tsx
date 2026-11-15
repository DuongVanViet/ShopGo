import { useId } from 'react';

export function productKind(name: string): number {
  const value = name.toLowerCase();
  return value.includes('cà rốt') || value.includes('rau')
    ? 0
    : value.includes('trứng') || value.includes('sữa')
      ? 2
      : value.includes('gà') || value.includes('thịt')
        ? 1
        : value.includes('gạo') || value.includes('khô')
          ? 3
          : value.includes('nước') || value.includes('uống')
            ? 4
            : 5;
}
export function ProductArt({ name, large = false }: { name: string; large?: boolean }) {
  const kind = productKind(name),
    id = useId().replaceAll(':', '');
  return (
    <svg
      className={`product-art art-${kind} ${large ? 'art-large' : ''}`}
      viewBox="0 0 240 185"
      role="img"
      aria-label={`Hình minh họa ${name}`}
    >
      <defs>
        <filter id={id}>
          <feDropShadow dx="0" dy="8" stdDeviation="5" floodOpacity=".13" />
        </filter>
        <linearGradient id={`${id}g`} x2=".8" y2="1">
          <stop stopColor="#ffb75d" />
          <stop offset="1" stopColor="#ed723b" />
        </linearGradient>
      </defs>
      <ellipse cx="120" cy="153" rx="68" ry="9" fill="#263b2a" opacity=".07" />
      <g filter={`url(#${id})`}>
        {kind === 0 ? (
          <g transform="translate(10 -9)">
            <g transform="rotate(25 120 100)">
              <path
                d="M87 60 Q117 37 140 65 Q140 86 108 155 Q100 164 98 149Z"
                fill={`url(#${id}g)`}
              />
              <path
                d="m112 60-8-37m13 37 16-39m-24 33-25-22"
                stroke="#34824a"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d="m99 88 13-4m-10 24 10-4m-9 24 7-3"
                stroke="#d7682c"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </g>
            <g transform="translate(56 22) rotate(-12 100 80)">
              <path d="M65 52 Q89 40 105 58 L81 135 Q74 147 72 130Z" fill="#f6a143" />
              <path
                d="m82 50-8-29m13 30 15-26m-19 24L62 33"
                stroke="#46964e"
                strokeWidth="7"
                strokeLinecap="round"
              />
            </g>
          </g>
        ) : kind === 1 ? (
          <g>
            <rect
              x="49"
              y="70"
              width="144"
              height="74"
              rx="22"
              fill="#fbfbf8"
              stroke="#dedbd2"
              strokeWidth="3"
            />
            <path d="M66 105c-7-21 15-46 39-40 31 5 49 31 31 48-20 16-59 13-70-8" fill="#edb7a7" />
            <path d="M112 118c-4-21 17-42 38-35 28 9 31 25 21 39-12 15-43 13-59-4" fill="#f3c3b0" />
            <path
              d="m81 83 29 18m14 0 24 17"
              stroke="#f9ddce"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path d="m62 135 4-11m110 12 4-12" stroke="#6c975b" strokeWidth="4" />
          </g>
        ) : kind === 2 ? (
          <g>
            <path d="M42 113 67 143h117l20-31Z" fill="#c8b799" />
            <rect x="40" y="105" width="163" height="25" rx="8" fill="#ddceb4" />
            {[
              [76, 92],
              [119, 88],
              [161, 92],
            ].map(([x, y], i) => (
              <ellipse
                key={x}
                cx={x}
                cy={y}
                rx="22"
                ry="31"
                transform={`rotate(${i === 0 ? -13 : i === 2 ? 12 : 0} ${x} ${y})`}
                fill={i === 1 ? '#f5eddb' : '#dbb58e'}
                stroke="#d1af88"
                strokeWidth="1.5"
              />
            ))}
            <path d="M40 121h163" stroke="#ad9e84" strokeWidth="2" />
          </g>
        ) : kind === 3 ? (
          <g>
            <path
              d="M76 40h88l-8 20 19 73q2 13-12 15H77q-13-1-11-15l17-73Z"
              fill="#eee5cf"
              stroke="#d9cfb9"
              strokeWidth="2"
            />
            <path d="M80 40h80l-4 19H85Z" fill="#245b43" />
            <rect x="76" y="86" width="89" height="42" rx="6" fill="#2d6349" />
            <text
              x="120"
              y="105"
              fontSize="13"
              fontWeight="700"
              fill="#fff9df"
              textAnchor="middle"
              fontFamily="sans-serif"
            >
              GẠO THƠM
            </text>
            <text x="120" y="119" fontSize="8" fill="#f3d988" textAnchor="middle">
              NGON TỪ HẠT LÀNH
            </text>
            <path d="m117 78 13-16m-8 13-9-6m13 1 5-2" stroke="#b8a15a" strokeWidth="3" />
          </g>
        ) : kind === 4 ? (
          <g>
            <rect x="101" y="33" width="36" height="15" rx="4" fill="#3f91ac" />
            <path
              d="M102 47h34v18l12 19v57q0 12-12 12h-32q-12 0-12-12V84l10-19Z"
              fill="#d5eaf0"
              stroke="#91beca"
              strokeWidth="2"
            />
            <rect x="92" y="94" width="56" height="34" fill="#4d98b2" />
            <path d="M98 109q11-12 21 0t23 0" fill="none" stroke="#fff" strokeWidth="3" />
            <path
              d="m103 80 5-18v-8"
              fill="none"
              stroke="#fff"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </g>
        ) : (
          <g>
            <rect x="64" y="60" width="114" height="84" rx="13" fill="#ded4b9" />
            <path d="M64 76h114m-57-16v84" stroke="#b6a378" strokeWidth="3" />
            <path
              d="m110 105 9 8 17-21"
              stroke="#386f4e"
              strokeWidth="5"
              fill="none"
              strokeLinecap="round"
            />
          </g>
        )}
      </g>
    </svg>
  );
}
export function GroceryArt() {
  return (
    <svg
      viewBox="0 0 480 340"
      className="grocery-art"
      role="img"
      aria-label="Túi thực phẩm tươi với rau củ, bánh mì và chai sữa"
    >
      <defs>
        <filter id="bag-shadow">
          <feDropShadow dx="0" dy="16" stdDeviation="12" floodColor="#6b5c2d" floodOpacity=".2" />
        </filter>
        <linearGradient id="paper" x2="1" y2="1">
          <stop stopColor="#dbc49b" />
          <stop offset="1" stopColor="#bba171" />
        </linearGradient>
      </defs>
      <circle cx="250" cy="164" r="140" fill="#fff4cb" />
      <ellipse cx="242" cy="306" rx="139" ry="15" fill="#bdb274" opacity=".3" />
      <g filter="url(#bag-shadow)">
        <path d="M171 157q-19-80 10-101 15-9 30 11l29 102" fill="#dfaf65" />
        <path
          d="m179 86 19-4m-15 28 22-6m-18 31 22-7"
          stroke="#b07e3c"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <g transform="rotate(19 295 125)">
          <path d="m274 129 8-66h30l11 66" fill="#e8f2e5" />
          <rect x="280" y="57" width="34" height="13" rx="3" fill="#76947c" />
          <rect x="265" y="108" width="66" height="75" rx="12" fill="#e9f0df" />
          <rect x="266" y="134" width="64" height="30" fill="#668769" />
        </g>
        <path d="M226 166q-51-89-2-91 14-56 33-14 37-22 34 16 55 11-11 91" fill="#387b4e" />
        <path
          d="m250 150 2-78m-3 42-22-17m25 0 19-13"
          stroke="#76a36d"
          strokeWidth="4"
          fill="none"
        />
        <g transform="rotate(-26 172 165)">
          <path d="M153 140q24-25 43 0l-20 83Z" fill="#ee9242" />
          <path
            d="m172 140-9-37m14 34 13-31"
            stroke="#508148"
            strokeWidth="7"
            strokeLinecap="round"
          />
        </g>
        <path d="M129 153h222l-22 139q-2 14-19 14H170q-17-1-20-16Z" fill="url(#paper)" />
        <path d="M129 153h222l-15 22H144Z" fill="#e5d1a9" />
        <path d="M194 200v-25q0-46 45-46t45 46v25" stroke="#9f8150" strokeWidth="9" fill="none" />
        <path d="M194 199v-25q0-42 45-42t45 42v25" stroke="#efe0c0" strokeWidth="5" fill="none" />
        <circle cx="242" cy="239" r="30" fill="#335f40" />
        <path
          d="M226 244q0-24 31-23 3 26-24 27m0-2 14-14"
          fill="none"
          stroke="#e2edce"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
      <path
        d="m98 92 6 9 11 2-9 6-1 11-7-9-11-1 9-7Zm280 108 5 8 9 2-8 5-1 9-6-7-9-2 8-5Z"
        fill="#71905c"
      />
      <circle cx="375" cy="75" r="7" fill="#e7a15a" />
    </svg>
  );
}
