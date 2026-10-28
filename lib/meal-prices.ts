export const BASE_DAY_PRICE=350;

export function loyaltyDiscountForCount(selectedCount:number){
 if(selectedCount>=20)return 20;
 if(selectedCount>=7)return 10;
 return 0;
}

export function priceForDay(date:string,discounts:Record<string,number>={},loyaltyPercent=0){
 const datePercent=[20,30,50].includes(discounts[date])?discounts[date]:0;
 const percent=Math.max(datePercent,loyaltyPercent);
 return {date,percent,price:BASE_DAY_PRICE*(100-percent)/100};
}

export function priceForDates(dates:string[],discounts:Record<string,number>={}){
 const loyaltyPercent=loyaltyDiscountForCount(dates.length);
 const days=dates.map(date=>priceForDay(date,discounts,loyaltyPercent));
 const baseTotal=dates.length*BASE_DAY_PRICE;
 const total=days.reduce((sum,d)=>sum+d.price,0);
 return {rate:dates.length?BASE_DAY_PRICE:0,total,days,loyaltyPercent,baseTotal,savings:baseTotal-total};
}
