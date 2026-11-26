export function ProductArt({ kind, color }: { kind: string; color: string }) {
  return <svg viewBox="0 0 180 150" className="product-art" aria-hidden="true">
    <ellipse cx="90" cy="134" rx="49" ry="8" fill="#10213c" opacity=".08" />
    {kind === 'bottle' && <><rect x="72" y="35" width="38" height="94" rx="14" fill={color}/><path d="M79 35V24h24v11" fill={color}/><rect x="78" y="70" width="26" height="28" rx="4" fill="white" opacity=".92"/><path d="M80 18h22v9H80z" fill="#17335d"/></>}
    {kind === 'carton' && <><path d="M56 38 75 22h48l10 16v92H56z" fill={color}/><path d="M75 22v17h58" fill="none" stroke="#fff" strokeWidth="3" opacity=".7"/><rect x="67" y="57" width="55" height="48" rx="3" fill="white" opacity=".9"/><circle cx="95" cy="78" r="12" fill={color} opacity=".45"/></>}
    {kind === 'bag' && <><path d="M54 43 68 24h46l13 19 10 78c-22 13-72 13-94 0z" fill={color}/><path d="M60 45h70" stroke="#fff" strokeWidth="4" opacity=".6"/><ellipse cx="90" cy="80" rx="30" ry="23" fill="#fff7e3"/><path d="M75 82c11-16 23-17 34-3-10 15-23 17-34 3Z" fill="#e9b85c"/></>}
    {kind === 'pack' && <><path d="M50 32q40 7 80 0l-7 100q-33-7-66 0z" fill={color}/><path d="M58 47h65" stroke="#fff" strokeWidth="5" opacity=".5"/><circle cx="91" cy="83" r="26" fill="#ffd447"/><path d="M72 84c15-12 27-10 39 1-13 12-26 13-39-1Z" fill="#e85c22"/></>}
    {kind === 'jar' && <><path d="M61 43h59v76c0 10-8 14-29 14s-30-4-30-14z" fill={color}/><rect x="57" y="30" width="67" height="17" rx="4" fill="#17335d"/><rect x="68" y="61" width="46" height="41" rx="8" fill="#fff7dc"/><circle cx="91" cy="81" r="12" fill="#d98921"/></>}
    {kind === 'cleaner' && <><path d="M80 25h28v20l10 14v65c0 7-7 10-28 10s-29-3-29-10V62l19-20z" fill={color}/><path d="M80 25h28v12H80z" fill="#17335d"/><rect x="67" y="72" width="45" height="37" rx="5" fill="white" opacity=".92"/><path d="m77 90 10 8 15-19" fill="none" stroke={color} strokeWidth="5"/></>}
  </svg>
}
