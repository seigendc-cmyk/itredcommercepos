import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import type { Order } from '../types';
export interface CompleteSaleResult { order:Order; sale:Order; receipt:Record<string,unknown>; payment:Record<string,unknown>; movementIds:string[]; shift:Record<string,unknown>; duplicate:boolean }
export async function completeOnlineSale(input:{vendorId:string;saleId:string;commandId:string;branchId:string;terminalId:string;shiftId:string;lines:Array<{productId:string;quantity:number;unitPrice?:number;discount?:number}>;payment:{method:string;tenderedAmount?:number;status?:string;provider?:string;reference?:string}}):Promise<CompleteSaleResult>{return(await httpsCallable<typeof input,CompleteSaleResult>(functions,'completeSale')(input)).data}
