// Map insertion order is not a change of exchange rates. Compare the complete
// currency set and its finite numeric values, preserving the stale-FX guard.
export function exchangeRateSnapshotsEqual(remote,expected){
 if(!remote||!expected||typeof remote!=='object'||typeof expected!=='object')return false;
 const a=Object.keys(remote).sort(),b=Object.keys(expected).sort();
 return a.length===b.length&&a.every((currency,index)=>currency===b[index]
  &&Number.isFinite(Number(remote[currency]))&&Number(remote[currency])>0
  &&Number(remote[currency])===Number(expected[currency]));
}
