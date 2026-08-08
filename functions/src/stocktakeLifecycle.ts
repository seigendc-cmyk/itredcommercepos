export type StocktakeStatus = 'DRAFT'|'OPEN'|'COUNTING'|'SUBMITTED'|'PENDING_APPROVAL'|'APPROVED'|'POSTING'|'POSTED'|'PARTIALLY_REVERSED'|'REVERSED'|'REJECTED'|'CANCELLED'|'CLOSED'|'FAILED';
const transitions: Record<StocktakeStatus, StocktakeStatus[]> = {
  DRAFT:['OPEN','CANCELLED'], OPEN:['COUNTING','CANCELLED'], COUNTING:['COUNTING','SUBMITTED','CANCELLED'],
  SUBMITTED:['PENDING_APPROVAL','CANCELLED'], PENDING_APPROVAL:['APPROVED','REJECTED','CANCELLED'], APPROVED:['POSTING'],
  POSTING:['POSTED','FAILED'], POSTED:['CLOSED','PARTIALLY_REVERSED','REVERSED'], PARTIALLY_REVERSED:['PARTIALLY_REVERSED','REVERSED'], REVERSED:['CLOSED'], REJECTED:[], CANCELLED:[], CLOSED:[], FAILED:['POSTING','CANCELLED'],
};
export function transitionStocktake(value: any,to:StocktakeStatus,actorId:string,commandId:string,now:string,reason?:string): Record<string, unknown> {
  const from = value.status as StocktakeStatus;
  if (!transitions[from]?.includes(to)) throw new Error(`Stocktake cannot transition from ${value.status} to ${to}.`);
  return {...value,status:to,version:value.version+1,updatedAt:now,statusHistory:[...(value.statusHistory||[]),{from:value.status,to,actorId,commandId,occurredAt:now,...(reason?{reason}:{})}]};
}
