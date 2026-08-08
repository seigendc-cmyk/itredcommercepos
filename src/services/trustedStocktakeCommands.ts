import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

export type StocktakeLocationType = 'WAREHOUSE' | 'BRANCH';
export interface TrustedStocktake { stocktakeId:string; vendorId:string; locationId:string; locationType:StocktakeLocationType; status:string; version:number; [key:string]:unknown }
export interface CountEvidence { stocktakeLineId:string; stocktakeId:string; productId:string; countedQuantity:number; systemQuantitySnapshot?:number; systemBalanceVersion?:number; varianceQuantity?:number; revision:number; offlineEvent:boolean }
const call = async <T>(name:string, data:Record<string,unknown>):Promise<T> => (await httpsCallable<Record<string,unknown>,T>(functions,name)(data)).data;
const command = (prefix:string,id:string) => `${prefix}:${id}:${crypto.randomUUID()}`;
export const createStocktakeCommand=(input:{vendorId:string;stocktakeId:string;locationId:string;locationType:StocktakeLocationType;type?:string;blindCount?:boolean;commandId?:string})=>call<TrustedStocktake>('createStocktake',{...input,commandId:input.commandId||command('create',input.stocktakeId)});
export const openStocktakeCommand=(vendorId:string,stocktakeId:string,commandId=command('open',stocktakeId))=>call<TrustedStocktake>('openStocktake',{vendorId,stocktakeId,commandId});
export const recordStocktakeCountCommand=(input:{vendorId:string;stocktakeId:string;countEventId:string;productId:string;countedQuantity:number;occurredAt?:string;deviceId?:string;offlineEvent?:boolean;reasonCode?:string;notes?:string;commandId?:string})=>call<CountEvidence>('submitStocktakeCount',{...input,commandId:input.commandId||`count:${input.countEventId}`});
export const submitStocktakeCommand=(vendorId:string,stocktakeId:string,commandId=command('submit',stocktakeId))=>call<TrustedStocktake>('submitStocktake',{vendorId,stocktakeId,commandId});
export const approveStocktakeCommand=(vendorId:string,stocktakeId:string,commandId=command('approve',stocktakeId))=>call<TrustedStocktake>('approveStocktake',{vendorId,stocktakeId,commandId});
export const rejectStocktakeCommand=(vendorId:string,stocktakeId:string,reason:string,commandId=command('reject',stocktakeId))=>call<TrustedStocktake>('rejectStocktake',{vendorId,stocktakeId,reason,commandId});
export const postStocktakeAdjustmentCommand=(vendorId:string,stocktakeId:string,commandId=`post:${stocktakeId}`)=>call<TrustedStocktake>('postStocktakeAdjustment',{vendorId,stocktakeId,commandId});
export const reverseStocktakeAdjustmentCommand=(vendorId:string,stocktakeId:string,reason:string,options?:{commandId?:string;quantities?:Record<string,number>})=>call<TrustedStocktake>('reverseStocktakeAdjustment',{vendorId,stocktakeId,reason,quantities:options?.quantities,commandId:options?.commandId||command('reverse',stocktakeId)});
export const closeStocktakeCommand=(vendorId:string,stocktakeId:string,commandId=command('close',stocktakeId))=>call<TrustedStocktake>('closeStocktake',{vendorId,stocktakeId,commandId});
